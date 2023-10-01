import * as http from "http"; //node.js에서 제공하는 http 모듈을 가져옴
//node.js의 http 모듈은 뭘 할 수 있어? -> http 서버를 만들 수 있어
//그럼 이 extension은 node.js기반 서버를 자체적으로 돌려서 사용자의 요청을 받아서 처리하는 거야? -> 아니야. 이 extension은 http 요청을 보내는 기능만을 제공해. (http 요청을 보내는 기능을 제공하는 모듈이 http 모듈이야)

//아무튼 전체적으로 이 파일에서는 response, request를 나눠서 각각의 header와 value를 타입으로 정의해서 내보내는 것을 확인할 수 있음

export type ResponseHeaders = http.IncomingHttpHeaders; //http.IncomingHttpHeaders는 http 모듈에서 제공하는 인터페이스이다.
//IncomingHttpHeaders는 http 요청에 대한 응답 헤더를 나타낸다. (https://nodejs.org/api/http.html#http_class_http_incomingmessage)
//예시 : { 'content-type': 'application/json; charset=utf-8' }

export type ResponseHeaderValue = {
  //ResponseHeaders의 value들을 나타내는 타입이야.
  [K in keyof ResponseHeaders]: ResponseHeaders[K]; //keyof ResponseHeaders는 ResponseHeaders의 key들을 나타내는 타입이야.
}[keyof ResponseHeaders]; //예시 : { 'content-type': 'application/json; charset=utf-8' }에서 'application/json; charset=utf-8'를 나타내는 타입이야.

export type RequestHeaders = http.OutgoingHttpHeaders; //http.OutgoingHttpHeaders는 http 모듈에서 제공하는 인터페이스
//내부적으로 문자열로 변환될... 숫자로 구성된 무언가인데 뭔지 잘 모르겠다..

export type RequestHeaderValue = {
  //RequestHeaders의 value들을 나타내는 타입이야.
  [K in keyof RequestHeaders]: RequestHeaders[K]; //keyof RequestHeaders는 RequestHeaders의 key들을 나타내는 타입이야.
}[keyof RequestHeaders]; //예시 : { 'content-type': 'application/json; charset=utf-8' }에서 'application/json; charset=utf-8'를 나타내는 타입이야.
