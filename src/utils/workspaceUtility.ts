import * as path from "path";
import { TextDocument, window, workspace } from "vscode";

export function getWorkspaceRootPath(): string | undefined {
  const document = getCurrentTextDocument(); //현재 열려있는 텍스트 문서를 가져옴
  if (document) {
    //document가 있으면
    const fileUri = document.uri; //fileUri에 document.uri를 저장
    const workspaceFolder = workspace.getWorkspaceFolder(fileUri); //fileUri에 해당하는 workspaceFolder를 가져옴
    if (workspaceFolder) {
      //workspaceFolder가 있으면
      return workspaceFolder.uri.toString(); //workspaceFolder.uri를 문자열로 변환하여 반환
    }
  }
}

export function getCurrentHttpFileName(): string | undefined {
  const document = getCurrentTextDocument();
  if (document) {
    const filePath = document.fileName;
    return path.basename(filePath, path.extname(filePath));
  }
}

export function getCurrentTextDocument(): TextDocument | undefined {
  //현재 열려있는 텍스트 문서를 가져오는 함수
  return window.activeTextEditor?.document; //현재 열려있는 텍스트 문서를 반환
}
