// Kontrakty okna rozszerzenia. Ten moduł służy wyłącznie dokumentacji i kontroli typów.

/** @typedef {import('./scanning.js').ScanSnapshot} ScanSnapshot */
/** @typedef {import('./scanning.js').ImageFinding} ImageFinding */
/** @typedef {import('./scanning.js').ScriptTree} ScriptTree */
/** @typedef {import('./scanning.js').PasswordAccessTree} PasswordAccessTree */
/** @typedef {import('./scanning.js').ScannerMessageType} ScannerCommand */
/** @typedef {import('./scanning.js').ScannerResponse} ScannerResponse */

/** @typedef {'images' | 'scripts' | 'password'} PopupView */

/**
 * Zdjęcie zakwalifikowane do pokazania po zakończeniu pomiaru.
 * @typedef {ImageFinding & {width: number|null, height: number|null, longSide: number|null}} VisibleImage
 */

/**
 * Stan jednego otwarcia okna rozszerzenia, wspólny dla scenariuszy i widoków.
 * @typedef {object} PopupSession
 * @property {ScanSnapshot|null} latestState Ostatnia odpowiedź skanera, zastępowana przy renderowaniu.
 * @property {VisibleImage[]} visibleImages Zdjęcia po filtrach i pomiarze; źródło zdjęć dla podsumowania i raportu.
 * @property {PopupView} activeView
 * @property {boolean} busy Okno rozszerzenia oczekuje na akcję lub eksport; nie oznacza, że skaner zbiera zdarzenia.
 * @property {ScannerCommand|''} pendingAction Komenda, na której wynik czeka okno rozszerzenia; pusty tekst po zakończeniu akcji.
 */

/**
 * Wynik pomiaru uzupełniany asynchronicznie w tym samym obiekcie.
 * @typedef {object} ImageDimensions
 * @property {'pending'|'loaded'|'failed'} state
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} longSide
 * @property {boolean} passes
 * @property {HTMLImageElement|null} probe
 */

/** @typedef {{image: ImageFinding, dimensions: ImageDimensions}} ImageRow */
/** @typedef {{images: ImageFinding[], rows: ImageRow[], pendingCount: number}} ImageRenderModel */

/**
 * @typedef {object} ImageDimensionsPort
 * @property {(image: ImageFinding) => ImageDimensions} getRecord Odczytuje pomiar lub rozpoczyna go, zwracając pending.
 * @property {(image: ImageFinding) => ImageDimensions|undefined} getKnownRecord Odczytuje pamięć podręczną bez rozpoczynania pomiaru.
 * @property {(images: ImageFinding[]) => void} prune
 */

/**
 * Dane biznesowe przekazywane do generatora raportu.
 * @typedef {object} ReportStats
 * @property {VisibleImage[]} imageFindings
 * @property {ScriptTree['thirdPartyGroups']} scriptGroups
 * @property {PasswordAccessTree['groups']} passwordGroups
 * @property {ScriptTree|null} scriptTree
 * @property {PasswordAccessTree|null} passwordTree
 */

/**
 * Liczniki i sygnały używane przez podsumowanie oraz raport.
 * @typedef {object} SecuritySummary
 * @property {number} totalIssues
 * @property {number} problemTypes
 * @property {boolean} hasAnyProblem
 * @property {boolean} hasAnyData
 * @property {number} improperAuthorizationImages
 * @property {number} cacheIssues
 * @property {number} googleIssues
 * @property {number} corsPixelDomains
 * @property {number} corsPixelUnknownDomains Domeny zawierające skrypty o nieustalonym dostępie do zdjęć.
 * @property {number} corsPixelImages
 * @property {number} thirdPartyDomains
 * @property {number} thirdPartyScripts
 * @property {number} passwordDomains
 * @property {number} passwordUnknownDomains Domeny, dla których nie ustalono możliwości dostępu do pola hasła.
 * @property {number} passwordInputs
 * @property {number} passwordEvents
 * @property {number} passwordValueEvents
 * @property {number} passwordValueDomains
 */

/**
 * @typedef {object} RiskCopy
 * @property {string} level
 * @property {string} text
 * @property {string} meaning
 * @property {string} actionTitle
 * @property {string} action
 */

/** @typedef {{sendMessage: (type: ScannerCommand) => Promise<ScanSnapshot>}} ScannerPort */
/** @typedef {{writeText: (text: string) => Promise<void>}} ClipboardPort */
/** @typedef {{confirmRestart: (message: string) => boolean}} ConfirmationPort */
/** @typedef {{setStatusText: (text: string) => void}} StatusDisplayPort */

/**
 * Operacje widoku potrzebne do przeprowadzenia scenariusza okna rozszerzenia.
 * @typedef {object} PopupDisplayPort
 * @property {(model: ImageRenderModel) => void} renderImages
 * @property {(state: ScanSnapshot|null) => void} renderScripts
 * @property {(state: ScanSnapshot|null) => void} renderPasswordAccess
 * @property {() => void} updateOverview
 * @property {() => void} updateCounter
 * @property {(state: ScanSnapshot|null) => void} updateStatusMessage
 * @property {() => void} updateButtons
 * @property {(text: string) => void} setStatusText
 * @property {(view: PopupView) => void} showActiveView
 * @property {() => void} resetRenderSignatures
 * @property {() => void} resetImageRenderSignature
 */

/**
 * Port zapisu danych wybranych przez scenariusz eksportu.
 * @typedef {object} ResultFilesPort
 * @property {(filename: string, data: unknown) => void} downloadJson
 * @property {(filename: string, headers: string[], rows: unknown[][]) => void} downloadCsv
 */

/**
 * @typedef {object} PopupFlowPorts
 * @property {PopupSession} session
 * @property {ScannerPort} scanner
 * @property {PopupDisplayPort} display
 * @property {ConfirmationPort} confirmation
 * @property {ImageDimensionsPort} dimensions
 */

/**
 * @typedef {object} ResultExportPorts
 * @property {PopupSession} session
 * @property {ClipboardPort} clipboard
 * @property {ResultFilesPort} files
 * @property {StatusDisplayPort} display
 */

/**
 * @typedef {object} ReportActionPorts
 * @property {{exportImagesPdf: () => Promise<void>, exportReportZip: () => Promise<void>}} reports
 * @property {StatusDisplayPort & {setBusy: (busy: boolean) => void}} display
 */

/**
 * @typedef {object} RenderCache
 * @property {string} imageRenderSignature
 * @property {string} scriptRenderSignature
 * @property {string} passwordRenderSignature
 */

/** @typedef {HTMLButtonElement & {dataset: DOMStringMap & {view: PopupView}}} MetricCard */

/**
 * Mapa elementów zadeklarowanych w popup.html.
 * Dawne liczniki resultCount/counterLabel mogą nie występować w szablonie.
 * @typedef {object} PopupElements
 * @property {HTMLParagraphElement} statusText
 * @property {HTMLElement|null} resultCount
 * @property {HTMLElement|null} counterLabel
 * @property {HTMLElement} scanControls
 * @property {HTMLElement} scanStateTitle
 * @property {HTMLElement} scanStateDescription
 * @property {HTMLButtonElement} startButton
 * @property {HTMLButtonElement} stopButton
 * @property {HTMLButtonElement} imagesTab
 * @property {HTMLButtonElement} scriptsTab
 * @property {HTMLButtonElement} passwordTab
 * @property {HTMLElement} imagesView
 * @property {HTMLElement} scriptsView
 * @property {HTMLElement} passwordView
 * @property {HTMLDivElement} resultsGrid
 * @property {HTMLButtonElement} copyImageLinksButton
 * @property {HTMLButtonElement} exportImagesButton
 * @property {HTMLButtonElement} exportPdfButton
 * @property {HTMLButtonElement} exportReportZipButton
 * @property {HTMLButtonElement} copyThirdPartyButton
 * @property {HTMLButtonElement} exportScriptsJsonButton
 * @property {HTMLButtonElement} exportScriptsCsvButton
 * @property {HTMLElement} pageUrlValue
 * @property {HTMLElement} pageOriginValue
 * @property {HTMLElement} totalScriptsValue
 * @property {HTMLElement} thirdPartyScriptsValue
 * @property {HTMLElement} thirdPartyDomainsValue
 * @property {HTMLDivElement} scriptTree
 * @property {HTMLElement} passwordInputsValue
 * @property {HTMLElement} passwordScriptsValue
 * @property {HTMLElement} passwordAccessesValue
 * @property {HTMLDivElement} passwordTree
 * @property {HTMLElement} riskLevelValue
 * @property {HTMLDivElement} securityWheel
 * @property {HTMLSpanElement} securityWheelText
 * @property {HTMLElement} securityWheelBadge
 * @property {HTMLParagraphElement} riskSummaryText
 * @property {HTMLParagraphElement} riskMeaningText
 * @property {HTMLDivElement} nextStepsPanel
 * @property {HTMLElement} nextStepTitle
 * @property {HTMLParagraphElement} nextStepText
 * @property {HTMLSpanElement} totalIssuesValue
 * @property {HTMLElement} summaryAuthorizationImages
 * @property {HTMLElement} summaryImageDetails
 * @property {HTMLElement} summaryScriptDomains
 * @property {HTMLElement} summaryScriptDetails
 * @property {HTMLElement} summaryPasswordDomains
 * @property {HTMLElement} summaryPasswordDetails
 * @property {MetricCard[]} metricCards
 */

/** @typedef {{elements: PopupElements, renderCache: RenderCache}} CachedViewDependencies */
/** @typedef {ReturnType<typeof import('../src/business/popup/popup-flow.js').createPopupFlow> & ReturnType<typeof import('../src/business/popup/result-exports.js').createResultExports> & ReturnType<typeof import('../src/business/popup/report-actions.js').createReportActions> & StatusDisplayPort} PopupActions */

export {};
