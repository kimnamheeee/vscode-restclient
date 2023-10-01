import { HttpRequest } from "./httpRequest";

export interface RequestParser {
  //RequestParser 인터페이스
  parseHttpRequest(name?: string): Promise<HttpRequest>; //parseHttpRequest 메소드, name이 있을 수도 있고 없을 수도 있고, Promise<HttpRequest>를 반환한다.
  //promise<httprequest>는 뭐야? -> promise는 비동기적으로 값을 반환하는 객체이다. promise<httprequest>는 httprequest를 비동기적으로 반환하는 객체이다.
  //해당 함수가 하는 일은 이 인터페이스를 상속받는 클래스에서 구체적으로 정의될 것이다
}
