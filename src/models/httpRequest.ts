import { Stream } from "stream";
import { getContentType } from "../utils/misc";
import { RequestHeaders } from "./base";

import got = require("got");

export class HttpRequest {
  //HttpRequest 클래스
  public isCancelled: boolean;
  private _underlyingRequest: got.GotPromise<Buffer>;
  public constructor(
    //인스턴스화될 때 호출되는 함수
    public method: string, //GET, POST, PUT, DELETE
    public url: string,
    public headers: RequestHeaders, //node.js에서 제공하는 requestheader 타입 (outgoinghttpheaders)
    public body?: string | Stream,
    public rawBody?: string,
    public name?: string
  ) {
    this.method = method.toLocaleUpperCase(); //method를 대문자로 바꿈
    this.isCancelled = false; //isCancelled를 false로 초기화
  }

  public get contentType(): string | undefined {
    //contentType을 반환하는 메소드
    return getContentType(this.headers); //getContentType 메소드를 이용하여 반환
  }

  public setUnderlyingRequest(request: got.GotPromise<Buffer>): void {
    this._underlyingRequest = request;
  }

  public cancel(): void {
    if (!this.isCancelled) {
      this._underlyingRequest?.cancel();
      this.isCancelled = true;
    }
  }
}

export class HistoricalHttpRequest {
  public constructor(
    public method: string,
    public url: string,
    public headers: RequestHeaders,
    public body: string | undefined,
    public startTime: number
  ) {}

  public static convertFromHttpRequest(
    httpRequest: HttpRequest,
    startTime: number = Date.now()
  ): HistoricalHttpRequest {
    return new HistoricalHttpRequest(
      httpRequest.method,
      httpRequest.url,
      httpRequest.headers,
      httpRequest.rawBody,
      startTime
    );
  }
}
