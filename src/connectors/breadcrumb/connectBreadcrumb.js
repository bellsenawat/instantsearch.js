import find from 'lodash/find';
import isEqual from 'lodash/isequal';

const usage = `Usage:
var customBreadcrumb = connectBreadcrumb(function renderFn(params, isFirstRendering) {
  // params = {
  //   createURL,  
  //   instantSearchInstance,
  //   items,
  //   refine,
  //   widgetParams,
  // }
});
search.addWidget(
  customBreadcrumb({
    attributes,
    [ rootPath = null ],
  })
);
Full documentation available at https://community.algolia.com/instantsearch.js/connectors/connectBreadcrumb.html
`;

/**
 * @typedef {Object} BreadcrumbItem
 * @property {string} name Name of the category or subcategory.
 * @property {string} value Value of breadcrumb item.
 */

/**
 * @typedef {Object} CustomBreadcrumbWidgetOptions
 * @property {string[]} attributes Attributes to use to generate the hierarchy of the breadcrumb.
 * @property {string} [rootPath = null] Prefix path to use if the first level is not the root level.
 *
 * You can also use a sort function that behaves like the standard Javascript [compareFunction](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#Syntax).
 */

/**
 * @typedef {Object} BreadcrumbRenderingOptions
 * @property {function(item.value): string} createURL Creates an url for the next state for a clicked item.
 * @property {HierarchicalMenuItem[]} items Values to be rendered.
 * @property {function(item.value)} refine Sets the path of the hierarchical filter and triggers a new search.
 * @property {Object} widgetParams All original `CustomBreadcrumbWidgetOptions` forwarded to the `renderFn`.
 */

/**
  * **Breadcrumb** connector provides the logic to build a custom widget
  * that will give the user the ability to explore facets in a path-like structure.
  *
  * This is commonly used for multi-level categorization of products on e-commerce
  * websites.
  *
  * @type {Connector}
  * @param {function(BreadcrumbRenderingOptions)} renderFn Rendering function for the custom **Breadcrumb* widget.
  * @return {function(CustomBreadcrumbWidgetOptions)} Re-usable widget factory for a custom **Breadcrumb** widget.
  */

function prepareItems(obj) {
  return obj.data.reduce((result, currentItem) => {
    if (currentItem.isRefined) {
      result.push({
        name: currentItem.name,
        value: currentItem.path,
      });
      if (Array.isArray(currentItem.data)) {
        const children = prepareItems(currentItem);
        result = result.concat(children);
      }
    }
    return result;
  }, []);
}

export default function connectBreadcrumb(renderFn) {
  return (widgetParams = {}) => {
    const { attributes, separator = ' > ', rootPath = null } = widgetParams;
    const [hierarchicalFacetName] = attributes;

    return {
      getConfiguration: currentConfiguration => {
        if (currentConfiguration.hierarchicalFacets) {
          const facetSet = find(
            currentConfiguration.hierarchicalFacets,
            ({ name }) => name === hierarchicalFacetName
          );
          if (facetSet) {
            if (
              !isEqual(facetSet.attributes, attributes) ||
              facetSet.separator !== separator
            ) {
              console.warn(
                'Using Breadcrumb & HierarchicalMenu on the same facet with different options'
              );
            }
            return {};
          }
        }

        return {
          hierarchicalFacets: [
            {
              attributes,
              name: hierarchicalFacetName,
              separator,
              rootPath,
            },
          ],
        };
      },

      init({ createURL, helper, instantSearchInstance }) {
        this._createURL = facetValue => {
          if (!facetValue) {
            const breadcrumb = helper.getHierarchicalFacetBreadcrumb(
              hierarchicalFacetName
            );
            if (breadcrumb.length > 0) {
              return createURL(
                helper.state.toggleRefinement(
                  hierarchicalFacetName,
                  breadcrumb[0]
                )
              );
            } else {
              return undefined;
            }
          }
          return createURL(
            helper.state.toggleRefinement(hierarchicalFacetName, facetValue)
          );
        };

        this._refine = function(facetValue) {
          if (!facetValue) {
            const breadcrumb = helper.getHierarchicalFacetBreadcrumb(
              hierarchicalFacetName
            );
            if (breadcrumb.length > 0) {
              helper
                .toggleRefinement(hierarchicalFacetName, breadcrumb[0])
                .search();
            }
          } else {
            helper.toggleRefinement(hierarchicalFacetName, facetValue).search();
          }
        };

        renderFn(
          {
            createURL: this._createURL,
            canRefine: false,
            instantSearchInstance,
            items: [],
            refine: this._refine,
            widgetParams,
          },
          true
        );
      },

      render({ instantSearchInstance, results, state }) {
        if (
          !state.hierarchicalFacets ||
          (Array.isArray(state.hierarchicalFacets) &&
            state.hierarchicalFacets.length === 0)
        ) {
          throw new Error(usage);
        }

        const [{ name: facetName }] = state.hierarchicalFacets;

        const facetsValues = results.getFacetValues(facetName);
        const items = prepareItems(facetsValues);

        renderFn(
          {
            canRefine: items.length > 0,
            createURL: this._createURL,
            instantSearchInstance,
            items,
            refine: this._refine,
            widgetParams,
          },
          false
        );
      },
    };
  };
}
