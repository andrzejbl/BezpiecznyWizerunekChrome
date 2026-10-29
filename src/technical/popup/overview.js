// Przepisanie gotowego podsumowania i oceny ryzyka do elementów interfejsu.
import { riskCopy, getRiskLevel } from '../../business/popup/summary.js';

/** @param {{elements: import('../../../types/popup.js').PopupElements, getSecuritySummary: () => import('../../../types/popup.js').SecuritySummary}} dependencies */
export function createOverviewView({ elements, getSecuritySummary }) {
  function updateCounter() {
    const summary = getSecuritySummary();
    if (elements.resultCount) {
      elements.resultCount.textContent = String(summary.totalIssues);
    }
    if (elements.counterLabel) {
      elements.counterLabel.textContent = 'typów problemów';
    }
  }

  /** @param {number} count */
  function formatProblemTypeCount(count) {
    if (count === 1) {
      return '1 typ problemu';
    }
    if (count > 1 && count < 5) {
      return `${count} typy problemów`;
    }
    return `${count} typów problemów`;
  }

  /** @param {import('../../../types/popup.js').SecuritySummary} summary */
  function updateSecurityWheel(summary) {
    if (!elements.securityWheel || !elements.securityWheelText || !elements.securityWheelBadge) {
      return;
    }

    let state = 'empty';
    let text = '?';
    let badge = 'brak danych';
    let label = 'Ocena prywatności: brak danych';

    if (summary.passwordUnknownDomains > 0 && summary.passwordDomains === 0 &&
        summary.improperAuthorizationImages === 0 && summary.corsPixelDomains === 0) {
      state = 'uncertain';
      badge = 'dostęp nieustalony';
      label = 'Ocena prywatności: nie ustalono dostępu skryptów do pól hasła';
    } else if (summary.hasAnyData && !summary.hasAnyProblem) {
      state = 'ok';
      text = 'OK';
      badge = '0 typów problemów';
      label = 'Ocena prywatności: zielona, dla przeanalizowanych zapytań sieciowych brak wykrytych problemów';
    } else if (summary.hasAnyProblem) {
      state = 'problem';
      text = '!';
      badge = formatProblemTypeCount(summary.problemTypes);
      label = `Ocena prywatności: czerwona, ${badge}`;
    }

    elements.securityWheel.dataset.state = state;
    elements.securityWheelText.textContent = text;
    elements.securityWheelBadge.textContent = badge;
    elements.securityWheel.setAttribute('aria-label', label);
  }

  function updateOverview() {
    const summary = getSecuritySummary();
    const copy = riskCopy(summary);

    updateSecurityWheel(summary);
    elements.totalIssuesValue.textContent = String(summary.problemTypes);
    elements.riskLevelValue.textContent = copy.level;
    elements.riskSummaryText.textContent = copy.text;

    if (elements.riskMeaningText) {
      elements.riskMeaningText.textContent = copy.meaning;
    }
    if (elements.nextStepsPanel && elements.nextStepTitle && elements.nextStepText) {
      elements.nextStepsPanel.hidden = !summary.hasAnyData;
      elements.nextStepTitle.textContent = copy.actionTitle;
      elements.nextStepText.textContent = copy.action;
    }

    elements.summaryAuthorizationImages.textContent = String(summary.improperAuthorizationImages);
    elements.summaryImageDetails.textContent = 'W pamięci: ' + summary.cacheIssues + ' · dostępne dla Google: ' + summary.googleIssues;
    elements.summaryScriptDomains.textContent = String(summary.thirdPartyDomains);
    elements.summaryScriptDetails.textContent = 'Z dostępem do zdjęć: ' + summary.corsPixelDomains + ' · skrypty: ' + summary.thirdPartyScripts +
      ((summary.corsPixelUnknownDomains || 0) > 0 ? ' · dostęp nieustalony: ' + summary.corsPixelUnknownDomains : '');
    const unknownDomains = summary.passwordUnknownDomains || 0;
    elements.summaryPasswordDomains.textContent = String(summary.passwordDomains + unknownDomains);
    elements.summaryPasswordDetails.textContent = summary.passwordDomains > 0
      ? 'KRYTYCZNE · domeny: ' + summary.passwordDomains + ' · odczyt wartości: ' + summary.passwordValueEvents +
        (unknownDomains > 0 ? ' · dostęp nieustalony: ' + unknownDomains : '')
      : (unknownDomains > 0
        ? 'Dostęp nieustalony · domeny: ' + unknownDomains + ' · pola hasła: ' + summary.passwordInputs
        : 'Pola hasła: ' + summary.passwordInputs + ' · odczyt wartości: ' + summary.passwordValueEvents);

    document.body.dataset.risk = getRiskLevel(summary);
  }

  return { updateCounter, updateOverview };
}
