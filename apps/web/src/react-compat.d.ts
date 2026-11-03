import type { JSX as ReactJSX } from "react";
declare global {
  namespace JSX { type Element = ReactJSX.Element; }
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
export {};
