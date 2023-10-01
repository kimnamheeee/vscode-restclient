import { Telemetry } from "./telemetry";

export function trace(eventName: string): MethodDecorator {
  return (
    target,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      Telemetry.sendEvent(eventName);
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
//trace 함수에 대해 설명해 줘
//trace 함수는 eventName을 인자로 받는다.
//그리고 MethodDecorator를 리턴한다.
//MethodDecorator는 함수를 인자로 받는다.
//그리고 descriptor를 리턴한다.
//descriptor는 PropertyDescriptor를 리턴한다.
//PropertyDescriptor는 value를 리턴한다.
//value는 함수를 리턴한다.
//그리고 descriptor.value에 함수를 넣어준다.
//그리고 descriptor를 리턴한다.
