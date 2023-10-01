import { TextDocument } from "vscode";
import { HttpResponse } from "../../models/httpResponse";
import { VariableType } from "../../models/variableType";

export type HttpVariableValue = string | {} | HttpResponse;

export interface HttpVariable {
  name: string;
  value?: HttpVariableValue;
  error?: any;
  warning?: any;
}

export interface HttpVariableContext {
  rawRequest: string;
  parsedRequest: string;
}

export interface HttpVariableProvider {
  //HttpVariableProvider 인터페이스
  readonly type: VariableType; //type은 VariableType 타입
  has( //name에 해당하는 변수가 있는지 확인하는 함수
    name: string, //name은 string 타입
    document?: TextDocument, //document는 TextDocument 타입
    context?: HttpVariableContext //context는 HttpVariableContext 타입
  ): Promise<boolean>; //Promise<boolean> 타입을 반환하는 함수
  get( //name에 해당하는 변수를 가져오는 함수
    name: string,
    document?: TextDocument,
    context?: HttpVariableContext
  ): Promise<HttpVariable>;
  getAll( //모든 변수를 가져오는 함수
    document?: TextDocument,
    context?: HttpVariableContext
  ): Promise<HttpVariable[]>;
}
