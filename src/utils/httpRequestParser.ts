import * as fs from "fs-extra";
import { EOL } from "os";
import { Stream } from "stream";
import { IRestClientSettings } from "../models/configurationSettings";
import { FormParamEncodingStrategy } from "../models/formParamEncodingStrategy";
import { HttpRequest } from "../models/httpRequest";
import { RequestParser } from "../models/requestParser";
import { MimeUtility } from "./mimeUtility";
import { getContentType, getHeader, removeHeader } from "./misc";
import {
  parseRequestHeaders,
  resolveRequestBodyPath,
} from "./requestParserUtil";
import { convertStreamToString } from "./streamUtility";
import { VariableProcessor } from "./variableProcessor";

const CombinedStream = require("combined-stream"); //combined-stream 모듈 (combined-stream란? -> 여러 스트림을 하나의 스트림으로 결합하는 모듈)
//combined-stream은 어디에서 제공되는 것? -> https://www.npmjs.com/package/combined-stream npm에서 제공하는 모듈이야
const encodeurl = require("encodeurl");

enum ParseState { //ParseState 열거형
  URL,
  Header,
  Body,
}

export class HttpRequestParser implements RequestParser {
  //requestParser는 httprequest를 promise로 반환하는 parseHttpRequest 메소드를 가지고 있다.
  //RequestParser 인터페이스를 구현하는 클래스
  private readonly defaultMethod = "GET"; //defaultMethod를 GET으로 설정
  private readonly queryStringLinePrefix = /^\s*[&\?]/; //queryStringLinePrefix를 &나 ?로 시작하는 문자열로 설정
  //예시 : ?name=foo&age=20
  //여기서 쿼리는 url쿼리에 해당하는듯
  private readonly inputFileSyntax =
    /^<(?:(?<processVariables>@)(?<encoding>\w+)?)?\s+(?<filepath>.+?)\s*$/; //inputFileSyntax를 <로 시작하는 문자열로 설정
  //예시 : <@utf8 C:\Users\user\Desktop\foo
  //rest api에서는 외부 파일로부터 body 정보, 또는 body에 들어갈 변수를 가져올 수 있다.
  private readonly defaultFileEncoding = "utf8"; //defaultFileEncoding을 utf8로 설정

  public constructor(
    //인스턴스화될 때 호출되는 함수
    private readonly requestRawText: string,
    private readonly settings: IRestClientSettings
  ) {}

  public async parseHttpRequest(name?: string): Promise<HttpRequest> {
    //RequestParser 내부에 정의되어 있던 parseHttpRequest 메소드를 구체화함
    //parseHttpRequest 메소드, name이 있을 수도 있고 없을 수도 있고, Promise<HttpRequest>를 반환한다.
    // parse follows http://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html
    // split the request raw text into lines
    const lines: string[] = this.requestRawText.split(EOL); //requestRawText를 EOL(줄바꿈 문자) 기준으로 나누어 lines에 저장
    //EOL이 '\n'이면, 'Hello\n\nWorld'를 EOL 기준으로 나누면 ['Hello', '', 'World']가 된다.
    const requestLines: string[] = []; //requestLines를 빈 배열로 초기화 -> url을 저장할 배열
    const headersLines: string[] = []; //headersLines를 빈 배열로 초기화 -> 헤더를 저장할 배열
    const bodyLines: string[] = []; //bodyLines를 빈 배열로 초기화 -> 바디를 저장할 배열
    const variableLines: string[] = []; //variableLines를 빈 배열로 초기화

    let state = ParseState.URL; //state를 URL로 초기화
    let currentLine: string | undefined; //currentLine을 undefined로 초기화
    while ((currentLine = lines.shift()) !== undefined) {
      //lines의 첫번째 요소를 currentLine에 저장하고, currentLine이 undefined가 아닐 때까지 반복
      //lines의 첫번째 요소를 currentLine에 저장했으면, 원래 lines의 두번째 요소였던 건 이제 0번 인덱스로 가게 된 거네? -> 맞아
      //그럼 루프가 한 단계 돌 때마다 인덱스가 하나씩 앞으로 가는 거네? -> 맞아
      const nextLine = lines[0]; //nextLine에 lines의 첫번째 요소를 저장
      //이때 lines[0]이 없으면? -> undefined가 저장됨
      //얘네 첫줄에는 url 적고, 그 다음에는 헤더 적고, 그 다음에는 빈 줄 적고, 그 다음에는 바디 적는 룰이 있나봄
      //POST https://naver.com
      //accept: application/json
      //
      //{"name": "foo", "age": 20}
      //이런식으로...

      //쿼리 있으면 url 다음 줄에다가 &나 ?로 시작하는 문자열로 적음

      //http request에서 쿼리스트링이랑 헤더, 바디를 같이 전달하는 건 불가능해? -> 불가능해

      switch (
        state //state에 따라 다른 동작을 수행
      ) {
        case ParseState.URL: //state가 URL일 때 (초기에도 url로 초기화했으니까 이게 default로 실행됨)
          requestLines.push(currentLine.trim()); //requestLines에 currentLine을 trim한 값을 push
          //trim이란? -> 문자열의 양 끝에 있는 공백을 제거하는 함수
          if (
            nextLine === undefined ||
            this.queryStringLinePrefix.test(nextLine)
          ) {
            //nextLine이 undefined이거나(nextLine이 없거나) queryStringLinePrefix로 시작하는 문자열이면 (&나 ?로 시작하는 문자열) 그냥 넘어감 (url에서 끝나거나, url에 있는 쿼리를 나타내는 경우이기 때문)
            // 이 경우 request line만 있는 request로 인식하기 때문
            //test() 메소드는 정규식과 일치하는 문자열이 있는지 검사하고, 결과를 true 또는 false로 반환한다.
            // request with request line only
          } else if (nextLine.trim()) {
            //nextLine이 공백이 아니면
            state = ParseState.Header; //state를 Header로 바꿈
          } else {
            //nextLine이 공백("")이면
            // request with no headers but has body
            // remove the blank line before the body
            lines.shift(); //lines의 첫번째 요소를 제거 (공백을 제거하는 것)
            state = ParseState.Body; //state를 Body로 바꿈
          }
          break;
        case ParseState.Header: //state가 Header일 때
          headersLines.push(currentLine.trim()); //headersLines에 currentLine을 trim한 값을 push
          if (nextLine?.trim() === "") {
            //nextLine이 공백이거나 없으면 (헤더는 없고 바로 body가 오는 경우)
            // request with no headers but has body
            // remove the blank line before the body
            lines.shift(); //lines의 첫번째 요소를 제거 (공백을 제거하는 것)
            state = ParseState.Body; //state를 Body로 바꿈
          }
          break;
        case ParseState.Body: //state가 Body일 때
          bodyLines.push(currentLine); //bodyLines에 currentLine을 push
          break;
      }
    }

    // parse request line
    const requestLine = this.parseRequestLine(
      //parseRequestLine 메소드를 이용하여 requestLine을 파싱
      requestLines.map((l) => l.trim()).join("") //requestLines의 요소들을 trim한 후 join하여 전달
    );
    //실행 결과 requestLine에는 {method, url} 객체가 저장됨

    // parse headers lines
    const headers = parseRequestHeaders(
      //들어간 defaultHeaders에 추가로 전달된 헤더를 합침
      headersLines, //headersLines는 헤더를 저장한 배열
      this.settings.defaultHeaders, //defaultHeaders는 기본 헤더를 저장한 객체
      requestLine.url //requestLine.url은 url을 저장한 문자열
    );

    // let underlying node.js library recalculate the content length
    removeHeader(headers, "content-length"); //headers에서 "content-length"를 제거 (content-length는 body의 길이를 나타내는 헤더, node js에서 자동계산한다고 함)

    // check request type
    //X-Request-Type이 GraphQL이라는 건 무슨 뜻이야? -> GraphQL 요청이라는 뜻이야
    //GraphQL 요청이라는 건 무슨 뜻이야? -> GraphQL은 페이스북에서 만든 쿼리 언어야. REST API 대신 GraphQL을 사용하면 효율적으로 데이터를 가져올 수 있어.
    //url으로 요청하는 것이 REST API고, body로 요청하는 것이 GraphQL이야. (GraphQL은 url은 모든 경우에 동일한 거지? -> 맞아)
    const isGraphQlRequest = getHeader(headers, "X-Request-Type") === "GraphQL"; //headers에서 "X-Request-Type"을 가져와서 그 값이 "GraphQL"이면 isGraphQlRequest를 true로 설정
    if (isGraphQlRequest) {
      //isGraphQlRequest가 true이면
      removeHeader(headers, "X-Request-Type"); //headers에서 "X-Request-Type"을 제거
      //왜 제거하는 거야? -> X-Request-Type은 GraphQL 요청을 나타내는 헤더야. 이 헤더는 GraphQL 서버에서만 사용되는 헤더라서 제거하는 거야.
      //https://github.com/Huachao/vscode-restclient#making-graphql-request 참고 (우리는 GraphQL 쿼리 방식을 모르기 때문에 일단 REST API로 한정해야 할듯)

      // a request doesn't necessarily need variables to be considered a GraphQL request (번역: GraphQL 요청은 변수가 필요하지 않아도 된다.)
      const firstEmptyLine = bodyLines.findIndex(
        (value) => value.trim() === "" //bodyLines에서 공백("")인 요소의 인덱스를 찾음
      );
      if (firstEmptyLine !== -1) {
        //공백("")인 요소가 있으면
        variableLines.push(...bodyLines.splice(firstEmptyLine + 1)); //variableLines에 bodyLines에서 firstEmptyLine + 1부터 끝까지의 요소를 push
        bodyLines.pop(); // remove the empty line between body and variables
        //bodyLines의 마지막 요소("")를 pop
      }
    }

    // parse body lines
    const contentTypeHeader = getContentType(headers); //headers에서 content-type을 가져옴
    let body = await this.parseBody(bodyLines, contentTypeHeader);
    if (isGraphQlRequest) {
      body = await this.createGraphQlBody(
        variableLines,
        contentTypeHeader,
        body
      );
    } else if (
      this.settings.formParamEncodingStrategy !==
        FormParamEncodingStrategy.Never &&
      typeof body === "string" &&
      MimeUtility.isFormUrlEncoded(contentTypeHeader)
    ) {
      if (
        this.settings.formParamEncodingStrategy ===
        FormParamEncodingStrategy.Always
      ) {
        const stringPairs = body.split("&");
        const encodedStringPairs: string[] = [];
        for (const stringPair of stringPairs) {
          const [name, ...values] = stringPair.split("=");
          const value = values.join("=");
          encodedStringPairs.push(
            `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
          );
        }
        body = encodedStringPairs.join("&");
      } else {
        body = encodeurl(body);
      }
    }

    // if Host header provided and url is relative path, change to absolute url
    const host = getHeader(headers, "Host");
    if (host && requestLine.url[0] === "/") {
      const [, port] = host.toString().split(":");
      const scheme = port === "443" || port === "8443" ? "https" : "http";
      requestLine.url = `${scheme}://${host}${requestLine.url}`;
    }

    return new HttpRequest(
      requestLine.method,
      requestLine.url,
      headers,
      body,
      bodyLines.join(EOL),
      name
    );
  }

  private async createGraphQlBody(
    variableLines: string[],
    contentTypeHeader: string | undefined,
    body: string | Stream | undefined
  ) {
    let variables = await this.parseBody(variableLines, contentTypeHeader);
    if (variables && typeof variables !== "string") {
      variables = await convertStreamToString(variables);
    }

    if (body && typeof body !== "string") {
      body = await convertStreamToString(body);
    }

    const matched = body?.match(/^\s*query\s+([^@\{\(\s]+)/i);
    const operationName = matched?.[1];

    const graphQlPayload = {
      query: body,
      operationName,
      variables: variables ? JSON.parse(variables) : {},
    };
    return JSON.stringify(graphQlPayload);
  }

  private parseRequestLine(line: string): { method: string; url: string } {
    //requestLine을 파싱하는 메소드
    // Request-Line = Method SP Request-URI SP HTTP-Version CRLF (요청라인 = 메소드 SP 요청-URI SP HTTP-버전 CRLF)
    let method: string; //method를 string으로 선언
    let url: string; //url을 string으로 선언

    let match: RegExpExecArray | null; //match를 RegExpExecArray 또는 null로 선언
    //RegExpExecArray는 타입스크립트 내장 타입, 뭔가 key value쌍으로 이루어진 배열인듯...?
    //RegExpExecArray는 정규식과 일치하는 문자열을 찾는 exec() 메소드의 반환 타입이다.
    //exec() 메소드는 정규식과 일치하는 문자열을 검색하는 메소드이다. 일치하는 문자열을 찾으면 배열을 반환하고, 일치하는 문자열을 찾지 못하면 null을 반환한다.
    if (
      (match =
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE|LOCK|UNLOCK|PROPFIND|PROPPATCH|COPY|MOVE|MKCOL|MKCALENDAR|ACL|SEARCH)\s+/i.exec(
          line
        )) //line이 GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, CONNECT, TRACE, LOCK, UNLOCK, PROPFIND, PROPPATCH, COPY, MOVE, MKCOL, MKCALENDAR, ACL, SEARCH로 시작하는 문자열이면
      //POST https://example.com/comments HTTP/1.1로 예시
      //line은 POST https://example.com/comments HTTP/1.1가 되는 것
      //그럼 RegExpExecArray는 뭐가 되는거지? -> ["POST ", "POST", index: 0, input: "POST https://example.com/comments HTTP/1.1", groups: undefined]
    ) {
      method = match[1]; //method에 match[1]을 저장
      url = line.substr(match[0].length); //url에 line에서 match[0].length만큼 잘라낸 값을 저장 (method에 들어간 거 제외 뒷부분 저장)
    } else {
      //이외의 경우
      // Only provides request url
      method = this.defaultMethod; //method에 defaultMethod를 저장 (GET)
      url = line; //url에 line을 저장
    }

    url = url.trim(); //url에서 공백제거 (이 과정까지 왔을 때 https://example.com/comments HTTP/1.1이 url에 저장되어 있음)

    if ((match = /\s+HTTP\/.*$/i.exec(url))) {
      //url이 HTTP로 시작하는 문자열이면 (대소문자 구분 없이)
      //https://example.com/comments HTTP/1.1로 예시
      //url은 https://example.com/comments HTTP/1.1가 되는 것
      //그럼 RegExpExecArray는 뭐가 되는거지? -> [" HTTP/1.1", index: 34, input: "https://example.com/comments HTTP/1.1", groups: undefined]
      url = url.substr(0, match.index); //url에 url에서 match.index만큼 잘라낸 값을 저장 (HTTP로 시작하는 문자열 제외 앞부분 저장)
    }

    //url은 https://example.com/comments가 되는 것

    return { method, url }; //method와 url을 반환
  }

  private async parseBody(
    //body를 파싱하는 메소드
    lines: string[], //lines는 string 배열
    contentTypeHeader: string | undefined //contentTypeHeader는 문자열
  ): Promise<string | Stream | undefined> {
    //Promise<string | Stream | undefined>를 반환
    if (lines.length === 0) {
      //lines의 길이가 0이면
      return undefined; //undefined를 반환
    }

    // Check if needed to upload file (파일을 업로드해야 하는지 확인) (외부 파일에 http request에 필요한 정보가 있는지 확인)
    //이 부분에서 외부 파일 참조가 없을 경우 contentTypeHeader가 될 수 있는 경우에 따라 body를 다르게 파싱하고 있음
    if (lines.every((line) => !this.inputFileSyntax.test(line))) {
      //lines의 모든 요소가 inputFileSyntax에 맞지 않으면 (<로 시작하는 문자열이 없으면, <로 시작하는 문자열은 rest client에서 지정한 파일 업로드 형식)
      //이 경우 외부 파일 참조가 없다는 뜻
      if (MimeUtility.isFormUrlEncoded(contentTypeHeader)) {
        //contentTypeHeader가 form-url-encoded 형식이면 (essence가 application/x-www-form-urlencoded이면)
        return lines.reduce((p, c, i) => {
          //lines를 reduce (reduce는 배열의 각 요소에 대해 주어진 reducer 함수를 실행하고, 하나의 결과값을 반환한다.)
          p += `${i === 0 || c.startsWith("&") ? "" : EOL}${c}`; //p에 i가 0이거나 c가 &로 시작하는 문자열이면 ""를 더하고, 그렇지 않으면 EOL를 더함
          return p; //p를 반환
        }, ""); //초기값은 ""로 설정
      } else {
        //contentTypeHeader가 form-url-encoded 형식이 아니면 (essence가 application/x-www-form-urlencoded이 아니면)
        //contentTypeHeader가 될 수 있는 것들 -> multipart/form-data, application/json, text/plain, text/css, text/csv, text/html, text/xml, application/javascript, application/xml, application/x-www-form-urlencoded 등
        const lineEnding = this.getLineEnding(contentTypeHeader); //lineEnding에 contentTypeHeader에 따라 줄바꿈 문자를 저장
        let result = lines.join(lineEnding); //result에 lines를 lineEnding으로 join한 값을 저장
        if (MimeUtility.isNewlineDelimitedJSON(contentTypeHeader)) {
          //contentTypeHeader가 newline-delimited json 형식이면
          result += lineEnding; //result 제일 끝에 lineEnding을 더함
        }
        return result; //result를 반환
      }
    } else {
      //lines의 요소에 inputFileSyntax에 맞는 요소가 있으면 (<로 시작하는 문자열이 있으면) -> 외부 파일 참조를 해야한다는 뜻이 됨
      //외부 파일 참조는 우리 서비스에는 없을 예정이기 때문에 여기까지만 읽겠습니다... 생각보다 참조 파일이랑 코드가 너무 많아서 하차
      const combinedStream = CombinedStream.create({
        //combinedStream을 생성
        maxDataSize: 10 * 1024 * 1024, //maxDataSize를 10 * 1024 * 1024로 설정
      });
      for (const [index, line] of lines.entries()) {
        //lines.entries의 의미 -> https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Array/entries
        //entries() 메소드는 배열의 각 인덱스에 대한 키/값 쌍을 가지는 새로운 Array Iterator 객체를 반환합니다.
        //예시: const array1 = ['a', 'b', 'c'];
        //const iterator1 = array1.entries();
        //for (const [index, element] of iterator1) {
        //  console.log(index, element);
        //}
        // expected output: 0 a
        // expected output: 1 b
        // expected output: 2 c

        //lines의 요소들을 index와 함께 순회
        if (this.inputFileSyntax.test(line)) {
          //line이 inputFileSyntax에 맞으면 (<로 시작하는 문자열이면)
          const groups = this.inputFileSyntax.exec(line); //groups에 line을 inputFileSyntax로 exec한 결과를 저장 (exec는 정규식과 일치하는 문자열을 검색하는 메소드이다. 일치하는 문자열을 찾으면 배열을 반환하고, 일치하는 문자열을 찾지 못하면 null을 반환한다.)
          //< C:\Users\Default\Desktop\demo.xml로 예시 (groups는 ["< C:\Users\Default\Desktop\demo.xml", undefined, undefined, "C:\Users\Default\Desktop\demo.xml", index: 0, input: "< C:\Users\Default\Desktop\demo.xml", groups: undefined])
          const groupsValues = groups?.groups; //groupsValues에 groups의 groups를 저장 (groupsValues는 {processVariables: undefined, encoding: undefined, filepath: "C:\Users\Default\Desktop\demo.xml"}가 됨)
          //위의 형식처럼 쪼개지는 이유는 inputFileSyntax가 그렇게 정의되어 있기 때문인듯 (regex 패턴을 특수한 형태로 작성하면 알아서 저렇게 쪼개주나봐)
          //정규식 너무 어려워요우... (https://jake-seo-dev.tistory.com/415 이해는 안 되지만 일단 첨부)
          if (groups?.length === 4 && !!groupsValues) {
            //groups의 길이가 4이고 groupsValues가 존재하면
            const inputFilePath = groupsValues.filepath; //inputFilePath에 groupsValues.filepath를 저장
            const fileAbsolutePath = await resolveRequestBodyPath(
              inputFilePath //inputFilePath를 파라미터로 resolveRequestBodyPath를 호출하여 반환된 값을 fileAbsolutePath에 저장
            ); //resolveRequestBodyPath는 http request에 필요한 외부 파일의 절대 경로를 반환하는 함수
            if (fileAbsolutePath) {
              //fileAbsolutePath가 존재하면
              if (groupsValues.processVariables) {
                //groupsValues.processVariables가 존재하면
                const buffer = await fs.readFile(fileAbsolutePath); //fileAbsolutePath의 파일을 읽어서 buffer에 저장
                const fileContent = buffer.toString(
                  //buffer를 문자열로 변환하여 fileContent에 저장
                  groupsValues.encoding || this.defaultFileEncoding //파일을 읽고 문자열로 변환할 때, groupsValues.encoding이 존재하면 groupsValues.encoding을, 존재하지 않으면 this.defaultFileEncoding을 인코딩으로 사용
                );
                const resolvedContent =
                  await VariableProcessor.processRawRequest(fileContent);
                combinedStream.append(resolvedContent);
              } else {
                combinedStream.append(fs.createReadStream(fileAbsolutePath));
              }
            } else {
              combinedStream.append(line);
            }
          }
        } else {
          combinedStream.append(line);
        }

        if (
          index !== lines.length - 1 ||
          MimeUtility.isMultiPartFormData(contentTypeHeader)
        ) {
          combinedStream.append(this.getLineEnding(contentTypeHeader));
        }
      }

      return combinedStream;
    }
  }

  private getLineEnding(contentTypeHeader: string | undefined) {
    //contentTypeHeader에 따라 줄바꿈 문자를 반환하는 함수
    return MimeUtility.isMultiPartFormData(contentTypeHeader) ? "\r\n" : EOL; //contentTypeHeader가 multipart/form-data 형식이면 "\r\n"을 반환, 그렇지 않으면 EOL을 반환
  }
}
