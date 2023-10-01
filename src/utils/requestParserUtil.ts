import * as fs from "fs-extra";
//fs가 뭐야? node.js에서 제공하는 파일 시스템 모듈
//어떤 걸 할 수 있어? 파일을 생성하거나 삭제하거나, 파일의 존재 여부를 확인하거나, 파일을 읽거나 쓰거나, 파일을 복사하거나 이동하는 등의 활동을 할 수 있음
import * as path from "path";
import { Uri } from "vscode";
import { RequestHeaders } from "../models/base";
import { removeHeader } from "./misc";
import {
  getCurrentTextDocument,
  getWorkspaceRootPath,
} from "./workspaceUtility";

export function parseRequestHeaders(
  headerLines: string[], //headerLines는 string[] 타입
  defaultHeaders: RequestHeaders, //defaultHeaders는 RequestHeaders 타입
  url: string //url은 string 타입
): RequestHeaders {
  //headerLines, defaultHeaders, url을 파라미터로 받아 RequestHeaders를 반환하는 함수
  //RequestHeaders는 http.OutgoingHttpHeaders 타입 (node.js에서 제공하는 타입)
  // message-header = field-name ":" [ field-value ]
  const headers: RequestHeaders = {}; //headers를 빈 객체로 초기화
  const headerNames: { [key: string]: string } = {}; //headerNames를 빈 객체로 초기화
  headerLines.forEach((headerLine) => {
    //headerLines의 각 요소에 대해
    let fieldName: string; //fieldName을 선언
    let fieldValue: string; //fieldValue를 선언
    const separatorIndex = headerLine.indexOf(":"); //headerLine에서 ":"의 인덱스를 찾아 separatorIndex에 저장
    //indexOf의 결과가 -1이면 찾는 문자열이 없다는 뜻이다.
    if (separatorIndex === -1) {
      //separatorIndex가 -1이면 (":"가 없으면)
      fieldName = headerLine.trim(); //fieldName에 headerLine을 trim한 값(앞뒤 공백을 제거한 값)을 저장
      fieldValue = ""; //fieldValue는 빈 문자열로 저장
    } else {
      //separatorIndex가 -1이 아니면 (":"가 있으면)
      fieldName = headerLine.substring(0, separatorIndex).trim(); //fieldName에 ":" 전까지의 값을 저장
      fieldValue = headerLine.substring(separatorIndex + 1).trim(); //fieldValue에 ":" 다음부터 끝까지의 값을 저장
    }

    const normalizedFieldName = fieldName.toLowerCase(); //fieldName을 소문자로 바꾼 값을 normalizedFieldName에 저장
    if (!headerNames[normalizedFieldName]) {
      //headerNames[normalizedFieldName]가 없으면
      headerNames[normalizedFieldName] = fieldName; //headerNames[normalizedFieldName]에 fieldName을 저장
      headers[fieldName] = fieldValue; //headers[fieldName]에 fieldValue를 저장
    } else {
      //headerNames[normalizedFieldName]가 있으면
      const splitter = normalizedFieldName === "cookie" ? ";" : ","; //splitter를 선언하는데, normalizedFieldName이 "cookie"면 ";"를, 아니면 ","를 저장
      headers[headerNames[normalizedFieldName]] += `${splitter}${fieldValue}`; //headers[headerNames[normalizedFieldName]]에 `${splitter}${fieldValue}`를 더함
    }
  });

  if (url[0] !== "/") {
    //url의 첫 글자가 "/"가 아니면
    removeHeader(defaultHeaders, "host"); //defaultHeaders에서 "host"를 제거
  }

  return { ...defaultHeaders, ...headers }; //defaultHeaders와 headers를 합쳐서 반환
}

export async function resolveRequestBodyPath(
  refPath: string
): Promise<string | undefined> {
  if (path.isAbsolute(refPath)) {
    //refPath가 절대 경로이면
    return (await fs.pathExists(refPath)) ? refPath : undefined; //refPath가 존재하면 refPath를 반환, 아니면 undefined를 반환
  }

  const workspaceRoot = getWorkspaceRootPath(); //workspaceRoot에 getWorkspaceRootPath()를 저장
  //getWorkspaceRootPath()는 현재 열려있는 텍스트 문서를 가져와서 그 문서가 속한 workspaceFolder의 uri를 문자열로 반환하는 함수
  if (workspaceRoot) {
    //workspaceRoot가 있으면
    const absolutePath = path.join(Uri.parse(workspaceRoot).fsPath, refPath); //workspaceRoot와 refPath를 합쳐서 absolutePath에 저장
    if (await fs.pathExists(absolutePath)) {
      //absolutePath가 존재하면
      return absolutePath; //absolutePath를 반환
    }
  }

  const currentFile = getCurrentTextDocument()?.fileName; //현재 열려있는 텍스트 문서의 fileName을 currentFile에 저장
  if (currentFile) {
    //currentFile이 있으면
    const absolutePath = path.join(path.dirname(currentFile), refPath); //currentFile의 디렉토리와 refPath를 합쳐서 absolutePath에 저장
    if (await fs.pathExists(absolutePath)) {
      //absolutePath가 존재하면
      return absolutePath; //absolutePath를 반환
    }
  }

  return undefined; //absolutePath가 존재하지 않으면 undefined를 반환
}
