const mime = require("mime-types");

class MimeType {
  //MimeType 클래스
  public readonly type: string; //읽기 전용 type
  public readonly subtype: string; //읽기 전용 subtype
  public readonly charset?: string; //읽기 전용 charset
  public constructor(type: string, subtype: string, charset?: string) {
    //type, subtype, charset를 파라미터로 받아 객체를 생성하는 생성자
    this.type = type.toLowerCase(); //type을 소문자로 변환하여 저장
    this.subtype = subtype?.toLowerCase() ?? ""; //subtype이 있으면 소문자로 변환하여 저장, 없으면 ""로 저장
    this.charset = charset; //charset을 저장
  }

  public get essence(): string {
    //essence를 반환하는 getter (getter란? -> 클래스의 프로퍼티를 읽을 때 호출되는 함수)
    return `${this.type}/${this.subtype}`; //type/subtype을 반환
  }
}

export class MimeUtility {
  //MimeUtility 클래스 (MimeUtility란? -> MIME 타입을 다루는 유틸리티)
  //MIME 타입이란? -> MIME 타입은 메일과 웹에서 파일의 확장자를 통해 파일의 종류를 구분하는 방식
  //MIME 타입은 type/subtype으로 이루어져 있으며, type은 대분류, subtype은 소분류를 의미함
  //예시 : text/html, text/css, image/jpeg, image/png, application/json, application/javascript, application/x-www-form-urlencoded 등
  private static readonly supportedImagesFormats = [
    //지원하는 이미지 포맷
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/png",
    "image/bmp",
  ];

  public static parse(contentTypeString: string) {
    //contentTypeString를 파싱하는 함수
    // application/json; charset=utf-8
    // application/vnd.github.chitauri-preview+sha
    const [essence, ...parameters] = contentTypeString //contentTypeString를 essence와 parameters로 나눔 (application/json; charset=utf-8에서 application/json은 essence, charset=utf-8은 parameters)
      .split(";") //;를 기준으로 나눔
      .map((v) => v.trim()); //trim()을 이용하여 공백을 제거함
    const [type, subtype] = essence.split("/"); //essence를 /를 기준으로 나눔 (application/json에서 application은 type, json은 subtype)
    const charset = parameters //parameters에서
      .find((p) => p.startsWith("charset=")) //charset=로 시작하는 것을 찾음
      ?.split("=")[1]; // =를 기준으로 나눈 뒤 두 번째 것을 가져옴
    //예시 : application/json; charset=utf-8에서 charset=utf-8에서 =를 기준으로 나눈 뒤 두 번째 것은 utf-8이므로 utf-8을 가져옴
    return new MimeType(type, subtype, charset); //MimeType 객체를 생성하여 반환
  }

  public static getExtension(
    contentTypeString: string | undefined,
    mimeAndFileExtensionMapping: { [key: string]: string }
  ): string {
    if (!contentTypeString) {
      return "";
    }

    const { essence } = this.parse(contentTypeString);

    // Check if user has custom mapping for this content type first
    if (essence in mimeAndFileExtensionMapping) {
      const ext = mimeAndFileExtensionMapping[essence];
      return ext.replace(/^(\.)+/, "");
    }
    return mime.extension(contentTypeString) || "";
  }

  public static isBrowserSupportedImageFormat(
    //브라우저가 지원하는 이미지 포맷인지 확인하는 함수
    contentTypeString: string | undefined
  ): boolean {
    // https://en.wikipedia.org/wiki/Comparison_of_web_browsers#Image_format_support
    // For chrome supports JPEG, GIF, WebP, PNG and BMP
    if (!contentTypeString) {
      //contentTypeString가 없으면
      return false; //false 반환
    }

    const { essence } = this.parse(contentTypeString); //contentTypeString를 파싱하여 essence를 가져옴
    // application/json; charset=utf-8를 예시로 설명해 봐 -> essence는 application/json (string 타입)
    return this.supportedImagesFormats.includes(essence); //supportedImagesFormats에 essence가 포함되어 있으면 true, 아니면 false 반환
  }

  public static isJSON(contentTypeString: string | undefined): boolean {
    if (!contentTypeString) {
      return false;
    }

    const { subtype, essence } = this.parse(contentTypeString);
    return (
      essence === "application/json" ||
      essence === "text/json" ||
      subtype.endsWith("+json") ||
      subtype.startsWith("x-amz-json")
    );
  }

  public static isXml(contentTypeString: string | undefined): boolean {
    if (!contentTypeString) {
      return false;
    }

    const { subtype, essence } = this.parse(contentTypeString);
    return (
      essence === "application/xml" ||
      essence === "text/xml" ||
      subtype.endsWith("+xml")
    );
  }

  public static isHtml(contentTypeString: string | undefined): boolean {
    if (!contentTypeString) {
      return false;
    }

    return this.parse(contentTypeString).essence === "text/html";
  }

  public static isJavaScript(contentTypeString: string | undefined): boolean {
    if (!contentTypeString) {
      return false;
    }

    const essence = this.parse(contentTypeString).essence;
    return (
      essence === "application/javascript" || essence === "text/javascript"
    );
  }

  public static isCSS(contentTypeString: string | undefined): boolean {
    if (!contentTypeString) {
      return false;
    }

    return this.parse(contentTypeString).essence === "text/css";
  }

  public static isMultiPartMixed(
    contentTypeString: string | undefined
  ): boolean {
    if (!contentTypeString) {
      return false;
    }

    return this.parse(contentTypeString).essence === "multipart/mixed";
  }

  public static isMultiPartFormData(
    //multipart/form-data인지 확인하는 함수
    //multipart/form-data란? -> multipart/form-data는 웹에서 파일을 전송할 때 사용하는 방식
    contentTypeString: string | undefined
  ): boolean {
    if (!contentTypeString) {
      //contentTypeString가 없으면
      return false; //false 반환
    }

    return this.parse(contentTypeString).essence === "multipart/form-data"; //contentTypeString를 파싱하여 essence가 multipart/form-data인지 여부를 반환
  }

  public static isFormUrlEncoded(
    //form url encoded인지 확인하는 함수
    contentTypeString: string | undefined //contentTypeString를 파라미터로 받음
  ): boolean {
    if (!contentTypeString) {
      //contentTypeString가 없으면
      return false; //false 반환
    }

    return (
      //contentTypeString를 파싱하여 essence가 application/x-www-form-urlencoded인지 여부를 반환
      this.parse(contentTypeString).essence ===
      "application/x-www-form-urlencoded"
    );
  }

  // application/json과 application/x-www-form-urlencoded
  // 요즈음의 대부분의 request에 대한 Content-Type은 application/json 타입인 것이 많습니다.
  // application/json은 RestFul API를 사용하게 되며 request를 날릴 때 대부분 json을 많이 사용하게 됨에 따라 자연스럽게 사용이 많이 늘게 되었습니다.
  // application/x-www-form-urlencoded는 html의 form의 기본 Content-Type으로 요즘은 자주 사용하지 않지만 여전히 사용하는 경우가 종종 존재합니다.
  // 차이점은 application/json은 {key: value}의 형태로 전송되지만 application/x-www-form-urlencoded는 key=value&key=value의 형태로 전달된다는 점입니다.
  // 즉 application/x-www-form-urlencoded는 보내는 데이터를 URL인코딩 이라고 부르는 방식으로 인코딩 후에 웹서버로 보내는 방식을 의미합니다. (따라서 사용하는 library나 framework에서 x-www-form-urlencoded를 사용할 경우 body 인코딩이 지원하는지 꼭 확인해봐야 합니다.)

  public static isNewlineDelimitedJSON(
    //newline delimited json인지 확인하는 함수
    contentTypeString: string | undefined
  ): boolean {
    if (!contentTypeString) {
      //contentTypeString가 없으면
      return false; //false 반환
    }

    return this.parse(contentTypeString).essence === "application/x-ndjson"; //contentTypeString를 파싱하여 essence가 application/x-ndjson인지 여부를 반환
    //application/x-ndjson란? -> newline delimited json의 약자로, json을 한 줄에 하나씩 적은 것을 의미함
    //예시 : {"name": "John"}\n{"name": "Jane"}\n{"name": "Jack"}
  }
}
