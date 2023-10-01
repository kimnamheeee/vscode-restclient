import {
  ExtensionContext,
  Range,
  TextDocument,
  ViewColumn,
  window,
} from "vscode";
import Logger from "../logger";
import {
  IRestClientSettings,
  RequestSettings,
  RestClientSettings,
} from "../models/configurationSettings";
import { HistoricalHttpRequest, HttpRequest } from "../models/httpRequest";
import { RequestMetadata } from "../models/requestMetadata";
import { RequestParserFactory } from "../models/requestParserFactory";
import { trace } from "../utils/decorator";
import { HttpClient } from "../utils/httpClient";
import {
  RequestState,
  RequestStatusEntry,
} from "../utils/requestStatusBarEntry";
import { RequestVariableCache } from "../utils/requestVariableCache";
import { Selector } from "../utils/selector";
import { UserDataManager } from "../utils/userDataManager";
import { getCurrentTextDocument } from "../utils/workspaceUtility";
import { HttpResponseTextDocumentView } from "../views/httpResponseTextDocumentView";
import { HttpResponseWebview } from "../views/httpResponseWebview";

export class RequestController {
  private _requestStatusEntry: RequestStatusEntry;
  private _httpClient: HttpClient;
  private _webview: HttpResponseWebview;
  private _textDocumentView: HttpResponseTextDocumentView;
  private _lastRequestSettingTuple: [HttpRequest, IRestClientSettings];
  private _lastPendingRequest?: HttpRequest;

  //아래 constructor는 RequestController 클래스의 생성자이다.
  //생성자는 클래스가 인스턴스화 될 때 호출되는 함수이다
  public constructor(context: ExtensionContext) {
    this._requestStatusEntry = new RequestStatusEntry();
    this._httpClient = new HttpClient();
    this._webview = new HttpResponseWebview(context);
    this._webview.onDidCloseAllWebviewPanels(() =>
      this._requestStatusEntry.update({ state: RequestState.Closed })
    );
    this._textDocumentView = new HttpResponseTextDocumentView();
  }

  @trace("Request")
  //@trace('Request')무슨 뜻이야 ?? -> 데코레이터를 사용하면 함수가 실행되기 전에 먼저 trace 함수가 실행된다.
  public async run(range: Range) {
    const editor = window.activeTextEditor; //현재 열려 있는 텍스트에디터
    const document = getCurrentTextDocument(); //현재 열려 있는 문서
    if (!editor || !document) {
      // 열려 있는 에디터나 문서가 없으면 함수 종료
      return;
    }

    const selectedRequest = await Selector.getRequest(editor, range); //선택된 request를 가져온다. (타입은 SelectedRequest)
    //request.text에는 실제 request에 해당하는 부분이 줄바꿈문자를 기준으로 한 덩어리가 되어 들어있고, request.metadatas에는 request의 메타데이터가 들어있다.
    if (!selectedRequest) {
      //선택된 request가 없으면 함수 종료
      return;
    }

    const { text, metadatas } = selectedRequest; //selectedRequest의 각 속성을 text, metadatas에 나누어 담음
    const name = metadatas.get(RequestMetadata.Name); //metadatas에서 name을 가져옴

    if (metadatas.has(RequestMetadata.Note)) {
      //metadatas에 note가 있으면
      const note = name
        ? `Are you sure you want to send the request "${name}"?`
        : "Are you sure you want to send this request?"; //name이 있으면 name을 넣고, 없으면 "Are you sure you want to send this request?"를 넣음
      const userConfirmed = await window.showWarningMessage(note, "Yes", "No"); //note를 띄우고, Yes, No 버튼을 띄움
      if (userConfirmed !== "Yes") {
        //Yes 버튼을 누르지 않으면 함수 종료 (request를 보내지 않음)
        return;
      }
    }

    const requestSettings = new RequestSettings(metadatas); //metadatas를 이용하여 requestSettings를 만듦 (메타데이터로 request를 어떻게 보낼지 결정하는 거임)
    const settings: IRestClientSettings = new RestClientSettings( //settings를 만듦
      requestSettings //requestSettings를 이용하여 만듦
    );

    // parse http request
    const httpRequest = await RequestParserFactory.createRequestParser(
      text,
      settings
    ).parseHttpRequest(name);

    await this.runCore(httpRequest, settings, document);
  }

  @trace("Rerun Request")
  public async rerun() {
    if (!this._lastRequestSettingTuple) {
      return;
    }

    const [request, settings] = this._lastRequestSettingTuple;

    // TODO: recover from last request settings
    await this.runCore(request, settings);
  }

  @trace("Cancel Request")
  public async cancel() {
    this._lastPendingRequest?.cancel();

    this._requestStatusEntry.update({ state: RequestState.Cancelled });
  }
  public async clearCookies() {
    try {
      await this._httpClient.clearCookies();
    } catch (error) {
      window.showErrorMessage(`Error clearing cookies:${error?.message}`);
    }
  }

  private async runCore(
    httpRequest: HttpRequest,
    settings: IRestClientSettings,
    document?: TextDocument
  ) {
    // clear status bar
    this._requestStatusEntry.update({ state: RequestState.Pending });

    // set last request and last pending request
    this._lastPendingRequest = httpRequest;
    this._lastRequestSettingTuple = [httpRequest, settings];

    // set http request
    try {
      const response = await this._httpClient.send(httpRequest, settings);

      // check cancel
      if (httpRequest.isCancelled) {
        return;
      }

      this._requestStatusEntry.update({
        state: RequestState.Received,
        response,
      });

      if (httpRequest.name && document) {
        RequestVariableCache.add(document, httpRequest.name, response);
      }

      try {
        const activeColumn = window.activeTextEditor!.viewColumn;
        const previewColumn =
          settings.previewColumn === ViewColumn.Active
            ? activeColumn
            : (((activeColumn as number) + 1) as ViewColumn);
        if (settings.previewResponseInUntitledDocument) {
          this._textDocumentView.render(response, previewColumn);
        } else if (previewColumn) {
          this._webview.render(response, previewColumn);
        }
      } catch (reason) {
        Logger.error("Unable to preview response:", reason);
        window.showErrorMessage(reason);
      }

      // persist to history json file
      await UserDataManager.addToRequestHistory(
        HistoricalHttpRequest.convertFromHttpRequest(httpRequest)
      );
    } catch (error) {
      // check cancel
      if (httpRequest.isCancelled) {
        return;
      }

      if (error.code === "ETIMEDOUT") {
        error.message = `Request timed out. Double-check your network connection and/or raise the timeout duration (currently set to ${settings.timeoutInMilliseconds}ms) as needed: 'rest-client.timeoutinmilliseconds'. Details: ${error}.`;
      } else if (error.code === "ECONNREFUSED") {
        error.message = `The connection was rejected. Either the requested service isn’t running on the requested server/port, the proxy settings in vscode are misconfigured, or a firewall is blocking requests. Details: ${error}.`;
      } else if (error.code === "ENETUNREACH") {
        error.message = `You don't seem to be connected to a network. Details: ${error}`;
      }
      this._requestStatusEntry.update({ state: RequestState.Error });
      Logger.error("Failed to send request:", error);
      window.showErrorMessage(error.message);
    } finally {
      if (this._lastPendingRequest === httpRequest) {
        this._lastPendingRequest = undefined;
      }
    }
  }

  public dispose() {
    this._requestStatusEntry.dispose();
    this._webview.dispose();
  }
}
