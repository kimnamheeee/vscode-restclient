import { CurlRequestParser } from "../utils/curlRequestParser";
import { HttpRequestParser } from "../utils/httpRequestParser";
import { IRestClientSettings, SystemSettings } from "./configurationSettings";
import { RequestParser } from "./requestParser";

export class RequestParserFactory {
  private static readonly curlRegex: RegExp = /^\s*curl/i; //curl로 시작하는 문자열을 찾는 정규식
  //예시 : curl -X POST "https://jsonplaceholder.typicode.com/posts" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"title\": \"foo\", \"body\": \"bar\", \"userId\": 1}"

  //여기 아래에 public static createRequestParser가 3개나 있는데 뭐가 다른거야? -> 오버로딩
  //오버로딩이란? -> 같은 이름의 메소드를 여러개 정의하는 것
  //오버로딩의 장점? -> 같은 기능을 하는 메소드를 여러개 만들 필요가 없어진다.
  //그럼 정의된 3개의 동명함수 중에서 어떤 게 실행되는지는 어떻게 결정해? -> 파라미터의 타입과 개수로 결정한다.
  public static createRequestParser(rawRequest: string): RequestParser; //rawRequest를 파라미터로 받아 RequestParser를 반환하는 함수
  public static createRequestParser( //rawRequest와 settings를 파라미터로 받아 RequestParser를 반환하는 함수
    rawRequest: string,
    settings: IRestClientSettings
  ): RequestParser;
  public static createRequestParser(
    //rawRequest와 settings를 파라미터로 받아 RequestParser를 반환하는 함수 (위의 함수와 다른 점은 settings가 선택적으로 들어갈 수 있다는 것)
    rawHttpRequest: string,
    settings?: IRestClientSettings
  ): RequestParser {
    settings = settings || SystemSettings.Instance; //settings가 없으면 SystemSettings.Instance를 사용한다.
    if (RequestParserFactory.curlRegex.test(rawHttpRequest)) {
      //rawHttpRequest가 curl로 시작하는 문자열이면
      return new CurlRequestParser(rawHttpRequest, settings); //CurlRequestParser를 반환한다.
    } else {
      //아니면
      return new HttpRequestParser(rawHttpRequest, settings); //HttpRequestParser를 반환한다.
    }
  }
}
