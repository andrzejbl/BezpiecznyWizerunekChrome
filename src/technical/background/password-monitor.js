// Treść wstrzykiwanego skryptu zachowujemy bajt po bajcie, bo jego URL źródłowy i stos wywołań są dowodami.

import { PASSWORD_ACCESS_BINDING } from './protocol.js';

export const PASSWORD_ACCESS_MONITOR_SOURCE = `
(() => {
  if (window.__networkAssetInspectorPasswordMonitorInstalled) {
    return;
  }

  Object.defineProperty(window, '__networkAssetInspectorPasswordMonitorInstalled', {
    value: true,
    configurable: false
  });

  const bindingName = '${PASSWORD_ACCESS_BINDING}';
  const originalType = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');
  const originalValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  const safeString = (value) => {
    try {
      return String(value === undefined || value === null ? '' : value).slice(0, 250);
    } catch (error) {
      return '';
    }
  };

  const getInputType = (target) => {
    try {
      if (originalType && originalType.get) {
        return safeString(originalType.get.call(target)).toLowerCase();
      }
      return safeString(target.getAttribute('type')).toLowerCase();
    } catch (error) {
      return '';
    }
  };

  const isPasswordInput = (target) => {
    try {
      return target instanceof HTMLInputElement && getInputType(target) === 'password';
    } catch (error) {
      return false;
    }
  };

  const summarizeTarget = (target) => {
    if (!target || !target.tagName) {
      return {};
    }
    return {
      tagName: safeString(target.tagName).toLowerCase(),
      id: safeString(target.id),
      name: safeString(target.name),
      autocomplete: safeString(target.autocomplete),
      inputType: getInputType(target)
    };
  };

  const report = (kind, target, detail) => {
    try {
      const binding = window[bindingName];
      if (typeof binding !== 'function') {
        return;
      }
      binding(JSON.stringify({
        kind: safeString(kind),
        detail: safeString(detail),
        target: summarizeTarget(target),
        pageUrl: safeString(location.href),
        timestamp: new Date().toISOString(),
        stack: String((new Error()).stack || '').slice(0, 8000)
      }));
    } catch (error) {
      // Do not affect page behavior if reporting fails.
    }
  };

  const reportIfPasswordResult = (kind, detail, result) => {
    try {
      if (isPasswordInput(result)) {
        report(kind, result, detail);
        return result;
      }
      if (result && typeof result.length === 'number') {
        const limit = Math.min(result.length, 25);
        for (let index = 0; index < limit; index += 1) {
          if (isPasswordInput(result[index])) {
            report(kind, result[index], detail);
            break;
          }
        }
      }
    } catch (error) {
      // Ignore probe errors.
    }
    return result;
  };

  const wrapMethod = (prototype, methodName, kind) => {
    try {
      const original = prototype && prototype[methodName];
      if (typeof original !== 'function') {
        return;
      }
      prototype[methodName] = function wrappedPasswordProbe(...args) {
        const result = original.apply(this, args);
        return reportIfPasswordResult(kind, args[0], result);
      };
    } catch (error) {
      // Ignore non-configurable browser APIs.
    }
  };

  if (originalType && originalType.configurable && originalType.get) {
    Object.defineProperty(HTMLInputElement.prototype, 'type', {
      configurable: true,
      enumerable: originalType.enumerable,
      get() {
        const value = originalType.get.call(this);
        if (safeString(value).toLowerCase() === 'password') {
          report('password.type.get', this, 'read input.type');
        }
        return value;
      },
      set(value) {
        if (safeString(value).toLowerCase() === 'password') {
          report('password.type.set', this, 'set input.type=password');
        }
        return originalType.set.call(this, value);
      }
    });
  }

  if (originalValue && originalValue.configurable && originalValue.get) {
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      enumerable: originalValue.enumerable,
      get() {
        if (isPasswordInput(this)) {
          report('password.value.get', this, 'read input.value');
        }
        return originalValue.get.call(this);
      },
      set(value) {
        if (isPasswordInput(this)) {
          report('password.value.set', this, 'write input.value');
        }
        return originalValue.set.call(this, value);
      }
    });
  }

  try {
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function wrappedAddEventListener(type, listener, options) {
      if (isPasswordInput(this)) {
        report('password.addEventListener', this, type);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  } catch (error) {
    // Ignore non-configurable browser APIs.
  }

  wrapMethod(Document.prototype, 'querySelector', 'password.querySelector');
  wrapMethod(Document.prototype, 'querySelectorAll', 'password.querySelectorAll');
  wrapMethod(Document.prototype, 'getElementById', 'password.getElementById');
  wrapMethod(Document.prototype, 'getElementsByName', 'password.getElementsByName');
  wrapMethod(Document.prototype, 'getElementsByTagName', 'password.getElementsByTagName');
  wrapMethod(Document.prototype, 'getElementsByClassName', 'password.getElementsByClassName');
  wrapMethod(Element.prototype, 'querySelector', 'password.element.querySelector');
  wrapMethod(Element.prototype, 'querySelectorAll', 'password.element.querySelectorAll');
})();
//# sourceURL=__network_asset_inspector_password_monitor.js
`;
