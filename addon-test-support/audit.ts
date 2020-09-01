import QUnit from 'qunit';
import { Promise } from 'rsvp';
import {
  run,
  AxeResults,
  RunOptions,
  ElementContext,
  ContextObject,
} from 'axe-core';
import formatViolation from './format-violation';
import { mark, markEndAndMeasure } from './performance';
import { getRunOptions } from './run-options';

type MaybeElementContext = ElementContext | RunOptions | undefined;

/**
 * Processes the results of calling axe.a11yCheck. If there are any
 * violations, it throws an error and then logs them individually.
 * @param {Object} results
 * @return {Void}
 */
function processAxeResults(results: AxeResults) {
  let violations = results.violations;

  if (violations.length) {
    let allViolations = violations.map((violation) => {
      let violationNodes = violation.nodes.map((node) => node.html);

      return formatViolation(violation, violationNodes);
    });

    let allViolationMessages = allViolations.join('\n');
    throw new Error(
      `The page should have no accessibility violations. Violations:\n${allViolationMessages}
To rerun this specific failure, use the following query params: &${QUnit.config.current.testId}&enableA11yAudit=true`
    );
  }
}

/**
 * Validation function used to determine if we have the shape of an {ElementContext} object.
 *
 * Function mirrors what axe-core uses for internal param validation.
 * https://github.com/dequelabs/axe-core/blob/d5b6931cba857a5c787d912ee56bdd973e3742d4/lib/core/public/run.js#L4
 *
 * @param potential
 */
export function _isContext(potential: MaybeElementContext) {
  'use strict';
  switch (true) {
    case typeof potential === 'string':
    case Array.isArray(potential):
    case self.Node && potential instanceof self.Node:
    case self.NodeList && potential instanceof self.NodeList:
      return true;

    case typeof potential !== 'object':
      return false;

    case (<ContextObject>potential).include !== undefined:
    case (<ContextObject>potential).exclude !== undefined:
      return true;

    default:
      return false;
  }
}

/**
 * Normalize the optional params of axe.run()
 *
 * Influenced by https://github.com/dequelabs/axe-core/blob/d5b6931cba857a5c787d912ee56bdd973e3742d4/lib/core/public/run.js#L35
 *
 * @param  elementContext
 * @param  runOptions
 */
export function _normalizeRunParams(
  elementContext?: MaybeElementContext,
  runOptions?: RunOptions | undefined
): [ElementContext, RunOptions] {
  let context: ElementContext;
  let options: RunOptions | undefined;

  if (!_isContext(elementContext)) {
    options = <RunOptions>elementContext;
    context = '#ember-testing-container';
  } else {
    context = <ElementContext>elementContext;
    options = runOptions;
  }

  if (typeof options !== 'object') {
    options = getRunOptions() || {};
  }

  return [context, options];
}

/**
 * Runs the axe a11y audit with the given context selector and options.
 * The context defaults to '#ember-testing-container' if not specified.
 * The options default axe-core defaults.
 *
 * @method runA11yAudit
 * @private
 */
export default function a11yAudit(
  contextSelector: MaybeElementContext = '#ember-testing-container',
  axeOptions?: RunOptions | undefined
): PromiseLike<void> {
  mark('a11y_audit_start');

  let [context, options] = _normalizeRunParams(contextSelector, axeOptions);

  document.body.classList.add('axe-running');

  return new Promise((resolve, reject) => {
    run(context, options, (error, result) => {
      if (!error) {
        return resolve(result);
      } else {
        return reject(error);
      }
    });
  })
    .then(processAxeResults)
    .finally(() => {
      document.body.classList.remove('axe-running');
      markEndAndMeasure('a11y_audit', 'a11y_audit_start', 'a11y_audit_end');
    });
}