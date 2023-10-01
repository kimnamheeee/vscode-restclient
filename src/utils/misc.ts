import * as crypto from "crypto";
//crypto 모듈은 다양한 암호화 알고리즘을 제공하는 모듈
import {
  RequestHeaders,
  RequestHeaderValue,
  ResponseHeaders,
  ResponseHeaderValue,
} from "../models/base";

export function getHeader(
  headers: ResponseHeaders,
  name: string
): ResponseHeaderValue;
export function getHeader(
  headers: RequestHeaders,
  name: string
): RequestHeaderValue;
export function getHeader(
  headers: RequestHeaders | ResponseHeaders,
  name: string
): RequestHeaderValue | ResponseHeaderValue {
  if (!headers || !name) {
    //headers나 name이 없으면
    return undefined; //undefined를 반환
  }

  const headerName = Object.keys(headers).find(
    //headers의 key 중에서
    (h) => h.toLowerCase() === name.toLowerCase() //name과 같은 것을 찾음
  );
  return headerName && headers[headerName]; //headerName이 있으면 headers[headerName]을 반환
}

export function getContentType( //content-type을 반환하는 함수
  headers: RequestHeaders | ResponseHeaders //headers를 파라미터로 받음
): string | undefined {
  const value = getHeader(headers, "content-type"); //getHeader 함수를 이용하여 content-type을 가져옴
  return value?.toString(); //value가 undefined가 아니면 value를 문자열로 변환하여 반환z
}

export function hasHeader(
  headers: RequestHeaders | ResponseHeaders,
  name: string
): boolean {
  return !!(
    headers &&
    name &&
    Object.keys(headers).some((h) => h.toLowerCase() === name.toLowerCase())
  );
}

export function removeHeader( //headers에서 name을 제거하는 함수
  headers: RequestHeaders | ResponseHeaders,
  name: string
) {
  if (!headers || !name) {
    //headers나 name이 없으면
    return; //아무것도 하지 않음
  }

  const headerName = Object.keys(headers).find(
    //headers의 key 중에서
    (h) => h.toLowerCase() === name.toLowerCase() //name과 같은 것을 찾음
  );
  if (headerName) {
    //headerName이 있으면
    delete headers[headerName];
  } //headerName을 제거
}

export function md5(text: string | Buffer): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

export function base64(text: string | Buffer): string {
  const buffer = Buffer.isBuffer(text) ? text : Buffer.from(text);
  return buffer.toString("base64");
}

export function isJSONString(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
