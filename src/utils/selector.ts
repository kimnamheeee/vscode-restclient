import { EOL } from "os"; //줄바꿈문자
import { Position, Range, TextDocument, TextEditor, window } from "vscode";
import * as Constants from "../common/constants";
import {
  fromString as ParseReqMetaKey,
  RequestMetadata,
} from "../models/requestMetadata";
import { SelectedRequest } from "../models/SelectedRequest";
import { VariableProcessor } from "./variableProcessor";

export interface RequestRangeOptions {
  ignoreCommentLine?: boolean;
  ignoreEmptyLine?: boolean;
  ignoreFileVariableDefinitionLine?: boolean;
  ignoreResponseRange?: boolean;
}

interface PromptVariableDefinition {
  name: string;
  description?: string;
}

export class Selector {
  // https://regexr.com/5q4qo
  //아래 정규표현식은 HTTP/1.1 200 OK 이런 식의 응답 코드를 찾는 정규표현식
  private static readonly responseStatusLineRegex = /^\s*HTTP\/[\d.]+/;

  public static async getRequest(
    editor: TextEditor,
    range: Range | null = null
  ): Promise<SelectedRequest | null> {
    if (!editor.document) {
      return null;
    } //현재 열려 있는 문서가 없으면 null 반환

    let selectedText: string | null; //선택 텍스트를 저장할 변수, 초기에는 null로 설정
    if (editor.selection.isEmpty || range) {
      //현재 에디터에서 드래그된 텍스트가 없거나 range가 있으면
      const activeLine = range?.start.line ?? editor.selection.active.line; //range가 있으면 range의 시작점의 라인을 가져오고, range가 없으면 선택된 텍스트의 시작점의 라인을 가져옴
      //그럼 activeLine의 타입은? -> number야. activeLine은 라인의 인덱스를 의미해.
      if (editor.document.languageId === "markdown") {
        //마크다운에서는 ```http로 시작하는 섹션들 중 현재 커서가 올라가 있는 섹션의 텍스트를 가져와서 selectedText에 넣음
        //현재 문서의 언어가 markdown이면
        selectedText = null; //선택된 텍스트가 없다고 설정
        for (const r of Selector.getMarkdownRestSnippets(editor.document)) {
          //markdown 문서의 모든 rest 스니펫에 대해
          const snippetRange = new Range(r.start.line + 1, 0, r.end.line, 0); //스니펫의 범위는 시작점부터 끝점까지
          // 아마 ```http를 빼주기 위해서 이렇게 따로 빼와서 설정한듯? -> 맞아. ```http를 빼주기 위해서야.
          if (snippetRange.contains(new Position(activeLine, 0))) {
            //스니펫의 범위가 현재 라인을 포함하면
            selectedText = editor.document.getText(snippetRange); //선택된 텍스트는 스니펫의 범위의 텍스트
          }
        }
      } else {
        //현재 문서의 언어가 markdown가 아니면 (.http이면)
        selectedText = this.getDelimitedText(
          editor.document.getText(), //fulltext 인자
          activeLine //currentLine 인자
        ); //구분자로 나뉜 영역 중 현재 라인이 속한 영역의 텍스트를 가져옴
      }
    } else {
      //현재 에디터에서 드래그된 텍스트가 있으면
      selectedText = editor.document.getText(editor.selection); //현재 에디터에서 선택된 텍스트를 가져옴
    }

    if (selectedText === null) {
      //선택된 텍스트가 없으면 (위의 과정에서 걸린 텍스트가 없음, 즉 적합한 형식의 api 요청으로 인식되는 부분이 없을 경우)
      return null; //null 반환, 함수 종료
    }

    // convert request text into lines
    const lines = selectedText.split(Constants.LineSplitterRegex); //선택된 텍스트를 줄바꿈을 기준으로 나눠서 배열로 만듦 (.http 확장자에서는 이미 진행된 과정)

    // parse request metadata
    const metadatas = this.parseReqMetadatas(lines); //선택된 텍스트에서 메타데이터를 파싱하여 Map으로 반환

    // process #@prompt comment metadata
    // 공식문서 피셜 프롬프트 변수는 유저한테 입력받는 무언가라는데 유저명이나 패스워드 입력할 때 쓰는 것 같네유... 우리는 이렇게는 안 할 거니까 패스
    const promptVariablesDefinitions =
      this.parsePromptMetadataForVariableDefinitions(
        metadatas.get(RequestMetadata.Prompt)
      );
    const promptVariables = await this.promptForInput(
      promptVariablesDefinitions
    );
    if (!promptVariables) {
      return null;
    }

    // parse actual request lines
    const rawLines = lines.filter((l) => !this.isCommentLine(l)); //선택된 텍스트에서 주석 라인을 제외한 라인만 가져옴
    const requestRange = this.getRequestRanges(rawLines)[0]; //선택된 텍스트에서 실제 요청 부분 중 첫번째의 시작점과 끝점을 가져옴
    if (!requestRange) {
      //실제 요청 부분이 없으면
      return null; //null 반환, 함수 종료
    }

    selectedText = rawLines //선택된 텍스트에서 (주석 라인은 제외되어 있음)
      .slice(requestRange[0], requestRange[1] + 1) //실제 요청 부분의 시작점부터 끝점까지의 라인을 가져옴
      .join(EOL); //줄바꿈을 기준으로 라인을 합침 -> 무슨소리 -> 예를 들어, ["GET https://www.naver.com", "Content-Type: application/json"]이런 식으로 되어 있으면 "GET https://www.naver.com\nContent-Type: application/json"이런 식으로 합쳐짐

    // variables replacement
    selectedText = await VariableProcessor.processRawRequest(
      //선택된 텍스트에서 변수를 처리하는 함수를 호출
      selectedText,
      promptVariables
    );

    return {
      //선택된 텍스트에서 실제 요청 부분을 줄바꿈기준 하나로 합친 덩어리를 text에 담아 반환함
      text: selectedText,
      metadatas: metadatas, //선택된 텍스트에서 메타데이터를 파싱한 결과를 metadatas에 담아 반환함
    };
  }

  public static parseReqMetadatas(
    //선택된 텍스트에서 메타데이터를 파싱하는 함수
    lines: string[] //선택된 텍스트를 줄바꿈을 기준으로 나눠서 배열로 만든 것
  ): Map<RequestMetadata, string | undefined> {
    //반환값은 map 객체, key는 RequestMetadata 타입, value는 string 또는 undefined
    const metadatas = new Map<RequestMetadata, string | undefined>(); //메타데이터를 저장할 맵
    for (const line of lines) {
      //선택된 텍스트의 모든 라인에 대해
      if (this.isEmptyLine(line) || this.isFileVariableDefinitionLine(line)) {
        //빈 라인이거나 파일 변수 정의 라인이면
        //파일 변수 정의 라인이 뭐야? -> 파일 변수 정의 라인은 @name = value 형식의 라인을 의미해.
        //그럼 파일 변수 정의 라인은 메타데이터가 아니잖아? -> 맞아. 파일 변수 정의 라인은 메타데이터가 아니야. 그래서 메타데이터를 파싱할 때 파일 변수 정의 라인은 무시해.
        //파일 변수 정의의 예시를 들어 줘 -> @name = value
        //언제 쓰는 거야? -> 파일 변수 정의는 파일 변수를 정의할 때 쓰는 거야.
        //파일 변수는 뭐야? -> 파일 변수는 파일에 저장된 값을 가져올 때 쓰는 거야. 파일 변수는 vscode의 환경 변수와 비슷해.
        //.env 파일에 저장된 값을 가져올 때 쓰는 거야? -> 맞아. .env 파일에 저장된 값을 가져올 때 쓰는 거야. (팩트체크 필요)
        continue;
      } //만약에 들어온 텍스트에서 빈 라인이거나 파일 변수 정의 라인이면 다음 루프로 넘어감

      if (!this.isCommentLine(line)) {
        //만약에 들어온 텍스트가 주석이 아니면
        // find the first request line
        break; //루프를 종료함
      }

      // here must be a comment line
      // 여기는 주석 라인이어야 해. (주석 라인이 아니면 루프를 종료했기 때문에 위 if문에 걸리지 않았다는 건 여기가 주석이어야 한다는 것)
      const matched = line.match(Constants.RequestMetadataRegex); //주석 라인에서 메타데이터를 찾음(@name value 형식)
      //match는 뭐야 -> match는 문자열에서 정규표현식과 일치하는 부분을 찾아서 배열로 반환해. 만약에 일치하는 부분이 없으면 null을 반환해.
      //@name value형식으로 들어가면? -> ["@name value", "name", "value"]가 반환돼.
      if (!matched) {
        //만약에 메타데이터를 찾지 못하면
        continue; //다음 루프로 넘어감 (다음 줄로 넘어감)
      }

      const metaKey = matched[1]; //메타데이터의 키
      const metaValue = matched[2]; //메타데이터의 값
      const metadata = ParseReqMetaKey(metaKey); //메타데이터의 키를 RequestMetadata 타입으로 변환
      if (metadata) {
        //메타데이터의 키가 RequestMetadata 타입으로 변환되면
        if (metadata === RequestMetadata.Prompt) {
          //메타데이터의 키가 prompt이면
          this.handlePromptMetadata(metadatas, line); //prompt 메타데이터를 처리하는 함수를 호출 (뭘 하는지는 일단 확인하지 않겠음...)
        } else {
          //메타데이터의 키가 prompt가 아니면
          metadatas.set(metadata, metaValue || undefined); //메타데이터의 키와 값을 맵에 저장
        }
      }
    }
    return metadatas; //메타데이터를 저장한 맵을 반환
  }

  public static getRequestRanges(
    //선택된 텍스트에서 실제 요청 부분의 시작점과 끝점을 가져오는 함수
    lines: string[],
    options?: RequestRangeOptions
  ): [number, number][] {
    options = {
      //options의 기본값 설정
      ignoreCommentLine: true, //주석 라인을 무시하고
      ignoreEmptyLine: true, //빈 라인을 무시하고
      ignoreFileVariableDefinitionLine: true, //파일 변수 정의 라인을 무시하고
      ignoreResponseRange: true, //응답 부분을 무시하고
      ...options, //options가 있으면 options를 사용하고, 없으면 기본값을 사용
    };
    const requestRanges: [number, number][] = []; //실제 요청 부분의 시작점과 끝점을 저장할 배열
    const delimitedLines = this.getDelimiterRows(lines); //구분자에 해당하는 라인의 인덱스를 모두 가져옴
    delimitedLines.push(lines.length); //구분자에 해당하는 라인의 인덱스에 마지막 라인의 인덱스를 추가함 -> 이렇게 하는 이유는? -> 마지막 라인까지 실제 요청 부분이라고 인식하기 위해서야.
    //delimitedLines에 들어있는 index, lines.length를 제외한 index를 요청으로 처리하기 위해서 이런 작업을 수행하는 거야? -> 맞아.
    //예시를 들어 봐
    //GET https://www.naver.com
    //Content-Type: application/json
    //### -> 이런 식으로 되어 있으면
    //구분자에 해당하는 라인의 인덱스는 2가 돼. (###의 인덱스는 2)
    //그럼 마지막 라인의 인덱스는? -> 3이 돼. (GET https://www.naver.com의 인덱스는 0, Content-Type: application/json의 인덱스는 1, ###의 인덱스는 2, 마지막 라인의 인덱스는 3)
    //그럼 마지막 라인의 인덱스를 추가하면 어떻게 되는 거야? -> [2, 3]이 돼. (2는 구분자 ###의 인덱스고, 3은 마지막 라인의 인덱스야.)
    //그럼 마지막 라인의 인덱스를 추가하는 이유가 뭐야? -> 마지막 라인까지 실제 요청 부분이라고 인식하기 위해서야.

    let prev = -1; //이전 라인의 인덱스를 저장할 변수, 초기에는 -1로 설정
    for (const current of delimitedLines) {
      //delimitedLines에 들어있는 인덱스에 대해
      let start = prev + 1; //시작점은 이전 라인의 인덱스 + 1
      let end = current - 1; //끝점은 현재 라인의 인덱스 - 1
      while (start <= end) {
        //시작점이 끝점보다 작거나 같으면
        const startLine = lines[start]; //시작점의 라인을 가져옴
        if (
          //시작점의 라인이
          options.ignoreResponseRange && //응답 부분을 무시하고
          this.isResponseStatusLine(startLine) //시작점의 라인이 응답 코드라면
        ) {
          break; //루프를 종료함
        } //이 while루프는 응답부분이 어디서부터 시작하는지 찾는 거지? -> 맞아. 응답부분이 어디서부터 시작하는지 찾는 거야.

        if (
          //시작점의 라인이
          (options.ignoreCommentLine && this.isCommentLine(startLine)) || //주석 라인이거나
          (options.ignoreEmptyLine && this.isEmptyLine(startLine)) || //빈 라인이거나
          (options.ignoreFileVariableDefinitionLine &&
            this.isFileVariableDefinitionLine(startLine)) //파일 변수 정의 라인이면
        ) {
          start++; //시작점을 1 증가시킴
          continue; //다음 루프로 넘어감
        }

        const endLine = lines[end]; //끝점의 라인을 가져옴
        if (
          (options.ignoreCommentLine && this.isCommentLine(endLine)) || //끝점의 라인이 주석 라인이거나
          (options.ignoreEmptyLine && this.isEmptyLine(endLine)) //끝점의 라인이 빈 라인이거나
        ) {
          end--; //끝점을 1 감소시킴
          continue; //다음 루프로 넘어감
        }

        requestRanges.push([start, end]); //실제 요청 부분의 시작점과 끝점을 배열에 추가
        break; //루프를 종료함
      }
      prev = current; //이전 라인의 인덱스를 현재 라인의 인덱스로 설정
    } //이 루프는 뭐하는 루프야? -> 실제 요청 부분의 시작점과 끝점을 찾는 루프야.

    return requestRanges; //실제 요청 부분의 시작점과 끝점을 저장한 배열을 반환
  }
  //예시를 들어줘 (요청, 응답, 주석, 빈 라인이 섞여 있는 경우)
  //GET https://www.naver.com
  //Content-Type: application/json
  //HTTP/1.1 200 OK
  //###
  //GET https://www.naver.com
  //Content-Type: application/json
  //이런 식으로 되어 있으면
  //실제 요청 부분의 시작점과 끝점은 [0, 1]과 [5, 6]이 돼.
  //그럼 실제 요청 부분의 시작점과 끝점을 찾는 과정을 설명해 줘
  //1. delimitedLines에는 [3, 7]이 들어가 있어. (3은 ###의 인덱스고, 7은 마지막 라인의 인덱스야.)
  //2. prev는 -1로 초기화돼. (prev는 이전 라인의 인덱스를 저장하는 변수야.)
  //3. for문을 돌면서 current에 3, 7이 들어가고, prev에는 current가 들어가.
  //4. while문을 돌면서 start는 prev+1, end는 current-1이 돼.
  //5. while문의 조건을 만족하면서 startLine은 lines[start]가 돼.
  //6. options.ignoreResponseRange가 true이고, startLine이 응답 코드라면 while문을 종료해.
  //7. options.ignoreCommentLine가 true이고, startLine이 주석 라인이거나, options.ignoreEmptyLine가 true이고, startLine이 빈 라인이거나, options.ignoreFileVariableDefinitionLine가 true이고, startLine이 파일 변수 정의 라인이면 start를 1 증가시키고 continue를 호출해.
  //8. endLine은 lines[end]가 돼.
  //9. options.ignoreCommentLine가 true이고, endLine이 주석 라인이거나, options.ignoreEmptyLine가 true이고, endLine이 빈 라인이면 end를 1 감소시키고 continue를 호출해.
  //10. requestRanges에 [0, 1]을 추가하고 while문을 종료해.
  //11. prev에는 current가 들어가고, for문을 종료해.
  //12. for문을 돌면서 current에 7이 들어가고, prev에는 current가 들어가.
  //13. while문을 돌면서 start는 prev+1, end는 current-1이 돼.
  //14. while문의 조건을 만족하면서 startLine은 lines[start]가 돼.
  //15. options.ignoreResponseRange가 true이고, startLine이 응답 코드라면 while문을 종료해.
  //16. options.ignoreCommentLine가 true이고, startLine이 주석 라인이거나, options.ignoreEmptyLine가 true이고, startLine이 빈 라인이거나, options.ignoreFileVariableDefinitionLine가 true이고, startLine이 파일 변수 정의 라인이면 start를 1 증가시키고 continue를 호출해.
  //17. endLine은 lines[end]가 돼.
  //18. options.ignoreCommentLine가 true이고, endLine이 주석 라인이거나, options.ignoreEmptyLine가 true이고, endLine이 빈 라인이면 end를 1 감소시키고 continue를 호출해.
  //19. requestRanges에 [5, 6]을 추가하고 while문을 종료해.
  //20. prev에는 current가 들어가고, for문을 종료해.
  //21. requestRanges를 반환해. (requestRanges는 [0, 1]과 [5, 6]이 들어있는 배열이야.)

  public static isCommentLine(line: string): boolean {
    return Constants.CommentIdentifiersRegex.test(line);
  }

  public static isEmptyLine(line: string): boolean {
    return line.trim() === "";
  }
  //함수의 기능에 대한 설명
  //선택된 텍스트에서 빈 라인인지 확인하는 함수

  public static isRequestVariableDefinitionLine(line: string): boolean {
    return Constants.RequestVariableDefinitionRegex.test(line);
  }

  public static isFileVariableDefinitionLine(line: string): boolean {
    return Constants.FileVariableDefinitionRegex.test(line);
  }

  public static isResponseStatusLine(line: string): boolean {
    //응답 코드인지 확인하는 함수
    return this.responseStatusLineRegex.test(line);
  }

  public static getRequestVariableDefinitionName(
    text: string
  ): string | undefined {
    const matched = text.match(Constants.RequestVariableDefinitionRegex);
    return matched?.[1];
  }

  public static getPrompVariableDefinition(
    text: string
  ): PromptVariableDefinition | undefined {
    const matched = text.match(Constants.PromptCommentRegex);
    if (matched) {
      const name = matched[1];
      const description = matched[2];
      return { name, description };
    }
  }

  public static parsePromptMetadataForVariableDefinitions(
    text: string | undefined
  ): PromptVariableDefinition[] {
    const varDefs: PromptVariableDefinition[] = [];
    const parsedDefs = JSON.parse(text || "[]");
    if (Array.isArray(parsedDefs)) {
      for (const parsedDef of parsedDefs) {
        varDefs.push({
          name: parsedDef["name"],
          description: parsedDef["description"],
        });
      }
    }

    return varDefs;
  }

  public static getDelimitedText(
    //현재 라인의 텍스트를 가져오는 함수
    fullText: string,
    currentLine: number
  ): string | null {
    //현재 라인의 텍스트를 가져오는데 실패하면 null을 반환
    const lines: string[] = fullText.split(Constants.LineSplitterRegex); //fullText로 받아온 값을 \r, \n 기준으로 나누어서 배열로 만듦
    const delimiterLineNumbers: number[] = this.getDelimiterRows(lines); //구분자에 해당하는 라인의 인덱스를 가져옴
    if (delimiterLineNumbers.length === 0) {
      //구분자가 없으면
      return fullText; //fullText를 반환
    }

    // return null if cursor is in delimiter line
    if (delimiterLineNumbers.includes(currentLine)) {
      return null;
    }

    if (currentLine < delimiterLineNumbers[0]) {
      return lines.slice(0, delimiterLineNumbers[0]).join(EOL);
    }

    if (currentLine > delimiterLineNumbers[delimiterLineNumbers.length - 1]) {
      return lines
        .slice(delimiterLineNumbers[delimiterLineNumbers.length - 1] + 1)
        .join(EOL);
    }

    for (let index = 0; index < delimiterLineNumbers.length - 1; index++) {
      const start = delimiterLineNumbers[index];
      const end = delimiterLineNumbers[index + 1];
      if (start < currentLine && currentLine < end) {
        return lines.slice(start + 1, end).join(EOL);
      }
    }

    return null;
  }

  private static getDelimiterRows(lines: string[]): number[] {
    //현재 라인이 delimiter인지 확인하는 함수
    //delimiter란? -> delimiter는 구분자를 의미해. 해당 프로그램에서 구분자는 ###이야.
    return Object.entries(lines) //lines를 배열로 만들어서
      .filter(([, value]) => /^#{3,}/.test(value)) //라인의 텍스트가 ###으로 시작하는지 확인 (###은 markdown에서 제목을 의미해) -> ###으로 시작하면 true를 반환
      .map(([index]) => +index); //라인의 인덱스를 가져옴
  } // 이 함수의 반환값은 어떤 형태지? -> number[]야. number[]는 숫자로 이루어진 배열이야.
  // 그럼 이 함수에는 delimiter가 속한 줄의 인덱스가 모두 들어 있는 거네? -> 맞아. 이 함수는 delimiter가 속한 줄의 인덱스를 모두 가져와서 배열로 만들어 반환해.

  //함수 이름 앞에 *은 무슨 뜻이야? -> 제너레이터 함수야. 제너레이터 함수는 함수를 멈추고 재개할 수 있어. 제너레이터 함수는 yield 키워드를 사용해 값을 반환해.
  public static *getMarkdownRestSnippets(
    document: TextDocument
  ): Generator<Range> {
    // 마크다운에 명시된 rest client 호출부분을 인식하는 함수 (인식되지 않으면 null 반환)
    // 범위를 반환하고 시작점을 다시 null로 초기화시킴
    const snippetStartRegx = new RegExp(
      "^```(" + ["http", "rest"].join("|") + ")$"
    ); // ```http 또는 ```rest
    const snippetEndRegx = /^\`\`\`$/; // ```

    let snippetStart: number | null = null; //스니펫 시작점
    for (let i = 0; i < document.lineCount; i++) {
      //문서의 모든 라인에 대해
      const lineText = document.lineAt(i).text; //라인의 텍스트를 가져옴

      const matchEnd = lineText.match(snippetEndRegx); //라인의 텍스트가 ```로 끝나는지 확인
      if (snippetStart !== null && matchEnd) {
        //스니펫 시작점이 null이 아니고 라인의 텍스트가 ```로 끝나면
        const snippetEnd = i; //스니펫 끝점은 현재 라인

        const range = new Range(snippetStart, 0, snippetEnd, 0); //스니펫의 범위는 시작점부터 끝점까지
        //snippetStart, 0, snippetEnd, 0에서 0의 의미는? -> 라인의 시작점부터 라인의 끝점까지를 의미해. 라인의 시작점과 끝점은 0부터 시작해.
        yield range; //스니펫의 범위를 반환 (range 객체의 형식으로)
        // 여기서 반환되는 스니펫의 범위는 숫자야? -> 아니야. range는 객체야. range는 vscode에서 제공하는 클래스야. range는 시작점과 끝점을 가지고 있어. 그래서 range를 반환하면 시작점과 끝점을 알 수 있어.
        // yield와 return의 차이가 뭐야 -> yield는 함수를 멈추지 않고 값을 반환해. return은 함수를 멈추고 값을 반환해.

        snippetStart = null; //스니펫 시작점을 null로 설정
        //여기서 스니펫 시작점을 다시 null로 설정하는 이유가 뭐야? -> 스니펫의 범위를 반환했으니까 다음 스니펫의 범위를 찾기 위해서야.
        //그럼 해당 함수는 여러 스니펫 범위를 동시에 인식할 수 있는 거야? -> 그렇지. 제너레이터 함수는 여러 값을 반환할 수 있어.
      } else {
        //라인의 텍스트가 ```로 끝나지 않으면
        const matchStart = lineText.match(snippetStartRegx); //라인의 텍스트가 ```http 또는 ```rest로 시작하는지 확인
        if (matchStart) {
          //라인의 텍스트가 ```http 또는 ```rest로 시작하면
          snippetStart = i; //스니펫 시작점은 현재 라인
        }
      }
    }
  }
  //위 함수의 반환값 range에는 ```http랑 마지막 ```도 포함되어 있는 거야? -> 아니야. ```http는 포함되지 않아. 그래서 range의 시작점은 ```http 다음 라인이고, 끝점은 마지막 ```의 라인이야.
  //그럼 시작 ```http는 미포함, 마지막 ```는 포함이라는 거네? -> 맞아. 그래서 range의 시작점은 snippetStart+1이고, 끝점은 snippetEnd로 설정해야 해.
  //왜그런지 설명해 줘
  //```http
  //GET https://www.naver.com
  //Content-Type: application/json
  //``` -> 이런 식으로 되어 있으면
  //range의 시작점은 1이고, 끝점은 4가 되어야 해. (snippetStart는 0, snippetEnd는 3)
  //그럼 range는 1, 0, 4, 0이 되는 거야? -> 맞아. range는 1, 0, 4, 0이야.

  private static handlePromptMetadata(
    //prompt 메타데이터를 처리하는 함수
    metadatas: Map<RequestMetadata, string | undefined>,
    text: string
  ) {
    const promptVarDef = this.getPrompVariableDefinition(text);
    if (promptVarDef) {
      const varDefs = this.parsePromptMetadataForVariableDefinitions(
        metadatas.get(RequestMetadata.Prompt)
      );
      varDefs.push(promptVarDef);
      metadatas.set(RequestMetadata.Prompt, JSON.stringify(varDefs));
    }
  }

  private static async promptForInput(
    defs: PromptVariableDefinition[]
  ): Promise<Map<string, string> | null> {
    const promptVariables = new Map<string, string>();
    for (const { name, description } of defs) {
      // In name resembles some kind of password prompt, enable password InputBox option
      const passwordPromptNames = [
        "password",
        "Password",
        "PASSWORD",
        "passwd",
        "Passwd",
        "PASSWD",
        "pass",
        "Pass",
        "PASS",
      ];
      let password = false;
      if (passwordPromptNames.includes(name)) {
        password = true;
      }
      const value = await window.showInputBox({
        prompt: `Input value for "${name}"`,
        placeHolder: description,
        password: password,
      });
      if (value !== undefined) {
        promptVariables.set(name, value);
      } else {
        return null;
      }
    }
    return promptVariables;
  }
}
