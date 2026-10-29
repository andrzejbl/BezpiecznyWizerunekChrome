/**
 * Część Chrome DevTools Protocol używana przez skaner.
 * API debuggera Chrome udostępnia ogólne obiekty, więc adaptery deklarują ich kształt na tej granicy.
 */
/**
 * @typedef {object} ResourceBody
 * @property {string} [stream]
 * @property {string} [content]
 * @property {boolean} [base64Encoded]
 * @property {number} [httpStatusCode]
 * @property {unknown} [headers]
 * @property {boolean} [success]
 * @property {string} [netErrorName]
 * @property {number} [netError]
 * @property {string} [mimeType]
 */
/** @typedef {{body?:string, base64Encoded?:boolean}} ResponseBody */
/** @typedef {{data?:string, base64Encoded?:boolean, eof?:boolean}} StreamChunk */
/**
 * @typedef {object} ScriptParsed
 * @property {string} [scriptId]
 * @property {string} [url]
 * @property {string} [sourceMapURL]
 * @property {number} [executionContextId]
 * @property {number} [startLine]
 * @property {number} [endLine]
 * @property {boolean} [isModule]
 * @property {string} [hash]
 * @property {string} [embedderName]
 * @property {boolean} [hasSourceURL]
 */
/**
 * @typedef {object} NetworkResponse
 * @property {string} [url]
 * @property {number} [status]
 * @property {string} [mimeType]
 * @property {boolean} [fromDiskCache]
 * @property {boolean} [fromServiceWorker]
 * @property {number} [encodedDataLength]
 * @property {unknown} [headers]
 */
/**
 * @typedef {object} NetworkEvent
 * @property {string} requestId
 * @property {{url?:string}} [request]
 * @property {string} [type]
 * @property {number} [timestamp]
 * @property {NetworkResponse} [redirectResponse]
 * @property {NetworkResponse} [response]
 * @property {number} [encodedDataLength]
 * @property {string} [errorText]
 * @property {string} [blockedReason]
 */
/**
 * @typedef {object} ExecutionContextCreated
 * @property {{id?:number, origin?:string, name?:string, auxData?:{frameId?:string,isDefault?:boolean}}} [context]
 */
/** @typedef {{frame?:{id?:string, parentId?:string, url?:string}}} FrameNavigated */
/** @typedef {{name?:string, payload?:string, executionContextId?:number}} BindingCalled */
/** @typedef {{result?:{value?:unknown}}} RuntimeEvaluation */
export {};
