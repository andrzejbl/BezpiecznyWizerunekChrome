/**
 * Wspólne opisy typów skanera. Ten plik zawiera tylko dokumentację i nie jest ładowany przez Chrome.
 * Wewnętrzny mutowalny stan używa map; zwracane wyniki zawierają rekordy i tablice możliwe do wysłania w wiadomości.
 * Przebieg zdarzeń, zmiany stanu i przykład zdjęcia opisuje docs/flows/scanning.md.
 */

/** @typedef {{nowIso: () => string}} Clock */
/** @typedef {{repeat: (callback: () => void, intervalMs: number) => number, cancel: (timerId: number) => void}} Scheduler */
/** @typedef {{origin:string, hostname:string, protocol:string, pathname:string, filename:string, query:string}} ParsedUrl */
/** @typedef {'first-party-origin'|'same-site'|'third-party'|'inline/eval/blob'|'browser/internal'} ScriptClassification */
/** @typedef {'inline'|'eval'|'blob'|'data'|'extension'|'chrome-internal'|'external'|'unknown'|'blocked'} ScriptType */
/** @typedef {Record<string, string>} ResponseHeaders */
/**
 * @typedef {object} NetworkMetadata
 * @property {string} [requestId]
 * @property {string} [url]
 * @property {string} [resourceType]
 * @property {string} [mimeType]
 * @property {number|null} [status]
 * @property {boolean} [fromDiskCache]
 * @property {boolean} [fromServiceWorker]
 * @property {number|null} [encodedDataLength]
 * @property {unknown} [headers]
 * @property {number} [timestamp]
 * @property {string} [errorText]
 * @property {string} [blockedReason]
 */
/**
 * Dane porównania są uzupełniane wraz z postępem pracy; pola dowodowe pojawiają się po uzyskaniu odpowiedzi.
 * @typedef {object} BodyComparison
 * @property {string} [status] queued, checking, same, different, skipped lub error; brak bodyComparison oznacza brak wyniku porównania.
 * @property {boolean} [exactMatch] Zgodność długości i SHA-256 obu odpowiedzi, niezależnie od ich statusów HTTP.
 * @property {boolean} [improperAuthorization] Zgodność treści oraz statusy HTTP 2xx obu odpowiedzi; reguła używana przez skaner.
 * @property {string} [reason]
 * @property {string|number} [error]
 * @property {string} [mode]
 * @property {string} [updatedAt]
 * @property {string} [comparedAt]
 * @property {string} [originalBodySha256]
 * @property {number} [originalBodyLength]
 * @property {string} [noCredentialsBodySha256]
 * @property {number} [noCredentialsBodyLength]
 * @property {number|null} [noCredentialsStatus]
 * @property {ResponseHeaders} [noCredentialsHeaders]
 * @property {string} [noCredentialsMimeType]
 */
/**
 * @typedef {object} ImageRecord
 * @property {string} url
 * @property {string} domain
 * @property {number|null} status
 * @property {string} mimeType
 * @property {string} resourceType
 * @property {string} requestId
 * @property {boolean} fromDiskCache
 * @property {boolean} fromServiceWorker
 * @property {number|null} encodedDataLength
 * @property {ResponseHeaders} headers
 * @property {string} timestamp
 * @property {BodyComparison} [bodyComparison] Wynik uzupełniany asynchronicznie na współdzielonym rekordzie zdjęcia.
 * @property {string} [previewDataUrl]
 */
/**
 * @typedef {object} CacheAudit
 * @property {boolean} checked
 * @property {string} headerSource
 * @property {string} cacheControl
 * @property {boolean} hasNoStore
 * @property {boolean} missingNoStore
 */
/** @typedef {{agent:string, value:string, blocksGoogle:boolean}} RobotsHeaderDirective */
/** @typedef {{directive:string, path:string, specificity?:number}} RobotsRule */
/** @typedef {{agents:string[], rules:RobotsRule[]}} RobotsGroup */
/**
 * @typedef {object} RobotsCheck
 * @property {string} origin
 * @property {string} robotsUrl
 * @property {string} status
 * @property {string|number} message
 * @property {string} checkedAt
 * @property {number|null} [httpStatusCode]
 * @property {ResponseHeaders} [headers]
 * @property {RobotsGroup[]} [groups]
 * @property {number} [contentLength]
 */
/**
 * @typedef {object} RobotsResult
 * @property {string} status
 * @property {boolean} blocked
 * @property {string} robotsUrl
 * @property {string|number} message
 * @property {string} [checkedAt]
 * @property {number|null} [httpStatusCode]
 * @property {RobotsRule|null} [matchedRule]
 */
/**
 * @typedef {object} IndexingAudit
 * @property {string} xRobotsTag
 * @property {string} headerSource
 * @property {RobotsHeaderDirective[]} xRobotsDirectives
 * @property {boolean} headerBlocksGoogle
 * @property {string} robotsTxtStatus
 * @property {string} robotsTxtCheckedAt
 * @property {string} robotsTxtUrl
 * @property {boolean} robotsTxtBlocksGoogle
 * @property {RobotsRule|null} robotsTxtMatchedRule
 * @property {string|number} robotsTxtMessage
 * @property {number|null} robotsTxtHttpStatusCode
 * @property {boolean} googleBlocked
 * @property {boolean} googleNotBlocked
 * @property {boolean} googleIndexingOpen
 */
/**
 * @typedef {object} CorsPixelAccess
 * @property {boolean} possible
 * @property {string[]} modes
 * @property {string} accessControlAllowOrigin
 * @property {string} responseHeaderSource
 * @property {string} pageOrigin
 * @property {string} imageOrigin
 * @property {string} reason
 */
/**
 * @typedef {object} CorsPixelSummary
 * @property {number} [unknownScriptCount] Skrypty z niepełnym rozpoznaniem kontekstu przy istniejących zdjęciach do oceny.
 * @property {number} [assessedScriptCount] Aktywne skrypty z ustalonym zakresem originów.
 * @property {string[]} [executionOrigins] Originy rzeczywistych kontekstów uwzględnionych w ocenie.
 * @property {boolean} possible
 * @property {number} imageCount
 * @property {string[]} imageDomains
 * @property {string[]} modes
 * @property {string[]} accessControlAllowOrigins
 */
/**
 * @typedef {object} ImageAuditFields
 * @property {CacheAudit} [cache]
 * @property {string} [cacheControl]
 * @property {boolean} [hasCacheNoStore]
 * @property {boolean} [missingCacheNoStore]
 * @property {IndexingAudit} [indexing]
 * @property {boolean} [googleIndexingBlocked]
 * @property {boolean} [googleIndexingNotBlocked]
 * @property {boolean} [googleIndexingOpen]
 * @property {CorsPixelAccess} [corsPixelAccess]
 * @property {boolean} [jsPixelAccessPossible]
 * @property {boolean} [bodyExactMatchNoCredentials]
 * @property {boolean} [improperImageAuthorization]
 */
/**
 * Dowody dotyczące zdjęcia udostępniane odbiorcom wyniku. Opcjonalne pola audytu pozwalają czytać starsze raporty.
 * @typedef {ImageRecord & ImageAuditFields} ImageFinding
 */
/**
 * @typedef {object} ScriptRecord
 * @property {string} scriptId
 * @property {string} url
 * @property {string} sourceMapURL
 * @property {number|null} executionContextId
 * @property {boolean} [executionContextDestroyed]
 * @property {number|null} startLine
 * @property {number|null} endLine
 * @property {boolean} isModule
 * @property {string} hash
 * @property {string} embedderName
 * @property {ScriptType} type
 * @property {string} origin
 * @property {string} hostname
 * @property {string} protocol
 * @property {string} pathname
 * @property {string} filename
 * @property {string} query
 * @property {string} registrableDomain
 * @property {string} timestamp
 * @property {string} displayName
 * @property {ScriptClassification} classification
 * @property {boolean} [blockedByClient]
 * @property {string} [blockedReason]
 * @property {string} [errorText]
 * @property {string} [requestId]
 * @property {string} [networkResourceType]
 * @property {string} [lastSeen]
 */
/**
 * @typedef {object} ScriptGroup
 * @property {string} key
 * @property {string} label
 * @property {string} hostname
 * @property {string} origin
 * @property {string} registrableDomain
 * @property {ScriptClassification} classification
 * @property {ScriptRecord[]} scripts
 * @property {CorsPixelSummary} corsPixelAccess
 * @property {number} count
 * @property {number} blockedCount
 * @property {number} corsPixelAccessImageCount
 */
/**
 * @typedef {object} ScriptTree
 * @property {string} label
 * @property {string} pageUrl
 * @property {string} pageOrigin
 * @property {string} pageHostname
 * @property {string} pageRegistrableDomain
 * @property {number} totalScripts
 * @property {number} thirdPartyScriptsCount
 * @property {number} thirdPartyDomainsCount
 * @property {number} thirdPartyCorsPixelAccessDomainsCount
 * @property {number} [thirdPartyCorsPixelAccessUnknownDomainsCount]
 * @property {number} [thirdPartyCorsPixelAccessImageCount] Unikalne zdjęcia dostępne dla zewnętrznych skryptów z uwzględnieniem ich kontekstów.
 * @property {CorsPixelSummary} corsPixelAccess
 * @property {ScriptGroup[]} groups
 * @property {ScriptGroup[]} thirdPartyGroups
 */
/**
 * @typedef {object} PasswordTarget
 * @property {string} [tagName]
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [autocomplete]
 * @property {string} [placeholder]
 * @property {string} [inputType]
 */
/**
 * @typedef {object} PasswordInputInfo
 * @property {boolean} hasPasswordInputs
 * @property {boolean} hasEverPasswordInputs
 * @property {number} count
 * @property {PasswordTarget[]} inputs
 * @property {string} lastChecked
 * @property {string} [error]
 * @property {string} [frameId]
 * @property {number} [documentRevision]
 */
/** @typedef {{hasPasswordInputs?:boolean, count?:number, inputs?:PasswordTarget[]}} PasswordFieldObservation */
/** @typedef {{functionName:string, url:string, lineNumber:number, columnNumber:number}} StackFrame */
/** @typedef {{kind?:string, detail?:string, target?:PasswordTarget, pageUrl?:string, stack?:string}} PasswordPayload */
/** @typedef {{payload:PasswordPayload, executionContextId:number|null}} PasswordObservation */
/**
 * @typedef {object} PasswordAccess
 * @property {'accessible'|'unknown'} [accessScope]
 * @property {string} id
 * @property {string} kind
 * @property {string} detail
 * @property {PasswordTarget} target
 * @property {string} pageUrl
 * @property {string} scriptUrl
 * @property {string} scriptOrigin
 * @property {string} scriptHostname
 * @property {string} scriptProtocol
 * @property {string} scriptPathname
 * @property {string} scriptFilename
 * @property {ScriptType} scriptType
 * @property {ScriptClassification} classification
 * @property {string} registrableDomain
 * @property {string} functionName
 * @property {number|null} lineNumber
 * @property {number|null} columnNumber
 * @property {number|null} executionContextId
 * @property {StackFrame[]} stackFrames
 * @property {number} count
 * @property {string} firstSeen
 * @property {string} lastSeen
 * @property {boolean} [observed]
 * @property {boolean} [blockedByClient]
 * @property {string} [blockedReason]
 * @property {string} [errorText]
 */
/**
 * @typedef {object} PasswordAccessGroup
 * @property {'accessible'|'unknown'} [accessScope]
 * @property {number} [unknownCount]
 * @property {string} key
 * @property {string} label
 * @property {string} hostname
 * @property {string} origin
 * @property {string} registrableDomain
 * @property {ScriptClassification} classification
 * @property {PasswordAccess[]} accesses
 * @property {number} eventCount
 * @property {number} valueAccessCount
 * @property {number} domSignalCount
 * @property {number} potentialCount
 * @property {number} blockedCount
 * @property {number} scriptCount
 */
/**
 * @typedef {object} PasswordAccessTree
 * @property {number} [unknownScripts]
 * @property {number} [unknownDomainsCount]
 * @property {boolean} hasPasswordInputs
 * @property {boolean} hasEverPasswordInputs
 * @property {number} passwordInputCount
 * @property {PasswordTarget[]} passwordInputs
 * @property {number} totalAccesses
 * @property {number} [totalValueAccesses]
 * @property {number} [valueAccessDomainsCount]
 * @property {number} [domSignalDomainsCount]
 * @property {number} uniqueScripts
 * @property {number} potentialScripts
 * @property {string} lastChecked
 * @property {boolean} polling
 * @property {number} pollIntervalMs
 * @property {PasswordAccessGroup[]} groups
 */
/** @typedef {{requestId:string, url:string}} ImageComparisonJob */
/** @typedef {{origin:string, topAccessible:boolean|null}} ImageContextAccess */
/** @typedef {{id:number, origin:string, name:string, frameId:string, isDefault?:boolean, passwordAccess?:{scope:'accessible'|'isolated',documentRevision:number}, imageAccess?:ImageContextAccess & {documentRevision:number}}} ExecutionContext */
/**
 * Mutowalny stan karty przechowywany przez aplikację działającą w tle.
 * @typedef {object} ScanState
 * @property {number} tabId
 * @property {boolean} attached Zapisany stan podłączenia debuggera; ta flaga dopuszcza obsługę zdarzeń i uruchamianie porównań.
 * @property {boolean} scanning Flaga aktywności ustawiana przy rozpoczęciu i zatrzymaniu skanu oraz przez zdarzenia cyklu życia; nie oznacza gotowości wszystkich wyników.
 * @property {boolean} stopRequested Pomaga funkcji obsługi odłączenia rozpoznać odłączenie zlecone przez aplikację.
 * @property {string} status idle, attaching, scanning, stopping, stopped, error, detached lub closed; opis etapu, nie status pojedynczego zdjęcia.
 * @property {string} statusMessage
 * @property {string} scanStartedAt
 * @property {string} scanStoppedAt
 * @property {string} debuggerDetachedAt
 * @property {string} pageUrl
 * @property {string} pageOrigin
 * @property {string} pageHostname
 * @property {string} pageRegistrableDomain
 * @property {string} mainFrameId Identyfikator głównej ramy z Page.frameNavigated, potrzebny do pobrania zasobu bez danych uwierzytelniających.
 * @property {ImageRecord[]} images Rekordy w kolejności dodania; te same obiekty znajdują się w imagesByUrl.
 * @property {Map<string, ImageRecord>} imagesByUrl Indeks rekordów zdjęć po pełnym URL; aktualizacja rekordu jest widoczna także w images.
 * @property {Map<string, NetworkMetadata>} imageRequests Tymczasowe częściowe metadane po requestId, scalane do loadingFinished lub loadingFailed.
 * @property {ImageComparisonJob[]} imageBodyCompareQueue Zadania oczekujące na rozpoczęcie, pobierane w kolejności dodania.
 * @property {Set<string>} imageBodyCompareQueuedUrls URL-e zadań oczekujących; URL znika ze zbioru przy rozpoczęciu zadania.
 * @property {number} imageBodyCompareActiveCount Licznik dla limitu współbieżności; zerowanie stanu i odłączenie zerują go bez anulowania rozpoczętych Promise.
 * @property {Map<string, RobotsCheck>} robotsChecksByOrigin
 * @property {Set<string>} robotsChecksInFlight
 * @property {ScriptRecord[]} scripts
 * @property {Map<string, ScriptRecord>} scriptsById
 * @property {Map<string, NetworkMetadata>} scriptRequests
 * @property {Map<string, ScriptRecord>} blockedScriptsByUrl
 * @property {Map<number, ExecutionContext>} contexts
 * @property {number} passwordDocumentRevision
 * @property {PasswordAccess[]} passwordAccesses
 * @property {Map<string, PasswordAccess>} passwordAccessesByKey
 * @property {number|null} passwordPollTimerId
 * @property {boolean} passwordPollInFlight
 * @property {PasswordInputInfo} passwordInputInfo
 */
/**
 * Bieżący wynik dla okna rozszerzenia; nie jest sygnałem zakończenia pracy ani pełną głęboką kopią ScanState.
 * @typedef {object} ScanSnapshot
 * @property {number|null} tabId
 * @property {boolean} attached
 * @property {boolean} scanning
 * @property {string} status
 * @property {string} statusMessage
 * @property {string} scanStartedAt
 * @property {string} scanStoppedAt
 * @property {string} debuggerDetachedAt
 * @property {string} pageUrl
 * @property {string} pageOrigin
 * @property {ImageFinding[]} images
 * @property {number} imageCount
 * @property {ScriptRecord[]} scripts
 * @property {ScriptTree} scriptTree
 * @property {PasswordAccess[]} passwordAccesses
 * @property {boolean} passwordInputPolling
 * @property {number} passwordInputPollIntervalMs
 * @property {PasswordAccessTree} passwordAccessTree
 */
/** @typedef {'getState'|'startScanWithReload'|'stopScan'} ScannerMessageType */
/** @typedef {{ok:true, state:ScanSnapshot}|{ok:false, error:string}} ScannerResponse */
/**
 * @typedef {object} LoadedResource
 * @property {import('./cdp.js').ResourceBody} body
 * @property {number|null} status
 * @property {ResponseHeaders} headers
 * @property {boolean} succeeded
 * @property {string|number} error
 * @property {string} mimeType
 */
/** @typedef {{bytes:Uint8Array<ArrayBuffer>, createPreview:(image:ImageRecord)=>string}} CapturedImageBody */
/**
 * @typedef {object} ResourcePorts
 * @property {(tabId:number,frameId:string,url:string)=>Promise<LoadedResource>} loadWithoutCredentials
 * @property {(tabId:number,body:import('./cdp.js').ResourceBody)=>string|Promise<string>} readResourceText
 * @property {(tabId:number,body:import('./cdp.js').ResourceBody,maxBytes:number)=>Uint8Array<ArrayBuffer>|Promise<Uint8Array<ArrayBuffer>>} readResourceBytes
 * @property {(tabId:number,requestId:string)=>Promise<CapturedImageBody>} readCapturedImageBody
 */
/**
 * @typedef {object} ScanBrowser
 * @property {(tabId:number)=>Promise<unknown>} enableNetwork
 * @property {(tabId:number)=>Promise<unknown>} enableScriptCapture
 * @property {(tabId:number)=>Promise<unknown>} enableRuntime
 * @property {(tabId:number)=>Promise<unknown>} enablePageEvents
 * @property {(tabId:number)=>Promise<unknown>} installPasswordBinding
 * @property {(tabId:number)=>Promise<unknown>} installPasswordMonitor
 * @property {(tabId:number)=>Promise<unknown>} disableCache
 * @property {(tabId:number)=>Promise<unknown>} bypassServiceWorker
 * @property {(tabId:number)=>Promise<unknown>} reloadPage
 * @property {(tabId:number)=>Promise<string|undefined>} readPageAddress
 * @property {(tabId:number)=>Promise<PasswordFieldObservation|undefined>} readPasswordInputs
 * @property {(tabId:number,contextId:number)=>Promise<boolean|undefined>} readPasswordContextAccess
 * @property {(tabId:number,contextId:number)=>Promise<ImageContextAccess|undefined>} readImageContextAccess
 */
export {};
