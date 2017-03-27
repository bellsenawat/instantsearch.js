import find from 'lodash/find';
import includes from 'lodash/includes';

import {checkRendering} from '../../lib/utils.js';

const usage = `Usage:
var customNumericRefinementList = connectNumericRefinementList(function renderFn(params, isFirstRendering) {
  // params = {
  //   createURL,
  //   facetValues,
  //   hasNoResults,
  //   toggleRefinement,
  //   instantSearchInstance,
  //   widgetParams,
  //  }
});
search.addWidget(
  customNumericRefinementList({
    attributeName,
    options,
  })
);
Full documentation available at https://community.algolia.com/instantsearch.js/connectors/connectNumericRefinementList.html
`;

/**
 * @typedef {Object} NumericRefinementListWidgetOptions
 * @property {string} attributeName Name of the attribute for filtering
 * @property {Object[]} options List of all the options
 * @property {string} options[].name Name of the option
 * @property {number} [options[].start] Low bound of the option (>=)
 * @property {number} [options[].end] High bound of the option (<=)
 */

/**
 * @typedef {Object} NumericRefinementListRenderingOptions
 * @property {function(string)} createURL create URL's for the next state, the string is the name of the selected option
 * @property {FacetValue[]} facetValues the list of available choices
 * @property {string} facetValues[].name Name of the option
 * @property {number} [facetValues[].start] Low bound of the option (>=)
 * @property {number} [facetValues[].end] High bound of the option (<=)
 * @property {number} [facetValues[].isRefined] true if the value is selected
 * @property {number} [facetValues[].attributeName] the name of the attribute in the records
 * @property {boolean} hasNoResults true if there were no results retrieved in the previous search
 * @property {function(string)} toggleRefinement set the selected value and trigger a new search
 * @property {Object} widgetParams all original options forwarded to rendering
 * @property {InstantSearch} instantSearchInstance the instance of instantsearch on which the widget is attached
 */

/**
 * Instantiate a list of refinements based on a facet
 *
 * @function connectNumericRefinementList
 * @param {function(NumericRefinementListRenderingOptions, boolean)} renderFn function that render the numeric refinement list
 * @return {function(NumericRefinementListWidgetOptions)} a custom numeric refinement list widget factory
 */
export default function connectNumericRefinementList(renderFn) {
  checkRendering(renderFn, usage);

  return widgetParams => {
    const {
      attributeName,
      options,
    } = widgetParams;

    if (!attributeName || !options) {
      throw new Error(usage);
    }

    return {
      init({helper, createURL, instantSearchInstance}) {
        this._toggleRefinement = facetValue => {
          const refinedState = refine(helper.state, attributeName, options, facetValue);
          helper.setState(refinedState).search();
        };

        this._createURL = state => facetValue => createURL(refine(state, attributeName, options, facetValue));

        const facetValues = options.map(facetValue =>
          ({
            ...facetValue,
            isRefined: isRefined(helper.state, attributeName, facetValue),
            attributeName,
          })
        );

        renderFn({
          createURL: this._createURL(helper.state),
          facetValues,
          hasNoResults: true,
          toggleRefinement: this._toggleRefinement,
          instantSearchInstance,
          widgetParams,
        }, true);
      },
      render({results, state, instantSearchInstance}) {
        const facetValues = options.map(facetValue =>
          ({
            ...facetValue,
            isRefined: isRefined(state, attributeName, facetValue),
            attributeName,
          })
        );

        renderFn({
          createURL: this._createURL(state),
          facetValues,
          hasNoResults: results.nbHits === 0,
          toggleRefinement: this._toggleRefinement,
          instantSearchInstance,
          widgetParams,
        }, false);
      },
    };
  };
}

function isRefined(state, attributeName, option) {
  const currentRefinements = state.getNumericRefinements(attributeName);

  if (option.start !== undefined && option.end !== undefined) {
    if (option.start === option.end) {
      return hasNumericRefinement(currentRefinements, '=', option.start);
    }
  }

  if (option.start !== undefined) {
    return hasNumericRefinement(currentRefinements, '>=', option.start);
  }

  if (option.end !== undefined) {
    return hasNumericRefinement(currentRefinements, '<=', option.end);
  }

  if (option.start === undefined && option.end === undefined) {
    return Object.keys(currentRefinements).length === 0;
  }

  return undefined;
}

function refine(state, attributeName, options, facetValue) {
  let resolvedState = state;

  const refinedOption = find(options, {name: facetValue});

  const currentRefinements = resolvedState.getNumericRefinements(attributeName);

  if (refinedOption.start === undefined && refinedOption.end === undefined) {
    return resolvedState.clearRefinements(attributeName);
  }

  if (!isRefined(resolvedState, attributeName, refinedOption)) {
    resolvedState = resolvedState.clearRefinements(attributeName);
  }

  if (refinedOption.start !== undefined && refinedOption.end !== undefined) {
    if (refinedOption.start > refinedOption.end) {
      throw new Error('option.start should be > to option.end');
    }

    if (refinedOption.start === refinedOption.end) {
      if (hasNumericRefinement(currentRefinements, '=', refinedOption.start)) {
        resolvedState = resolvedState.removeNumericRefinement(attributeName, '=', refinedOption.start);
      } else {
        resolvedState = resolvedState.addNumericRefinement(attributeName, '=', refinedOption.start);
      }
      return resolvedState;
    }
  }

  if (refinedOption.start !== undefined) {
    if (hasNumericRefinement(currentRefinements, '>=', refinedOption.start)) {
      resolvedState = resolvedState.removeNumericRefinement(attributeName, '>=', refinedOption.start);
    } else {
      resolvedState = resolvedState.addNumericRefinement(attributeName, '>=', refinedOption.start);
    }
  }

  if (refinedOption.end !== undefined) {
    if (hasNumericRefinement(currentRefinements, '<=', refinedOption.end)) {
      resolvedState = resolvedState.removeNumericRefinement(attributeName, '<=', refinedOption.end);
    } else {
      resolvedState = resolvedState.addNumericRefinement(attributeName, '<=', refinedOption.end);
    }
  }

  return resolvedState;
}

function hasNumericRefinement(currentRefinements, operator, value) {
  const hasOperatorRefinements = currentRefinements[operator] !== undefined;
  const includesValue = includes(currentRefinements[operator], value);

  return hasOperatorRefinements && includesValue;
}
