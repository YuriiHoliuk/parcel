// @flow
/* global globalThis:readonly */

import type {Graph} from '@parcel/graph';
import type {AssetGraphNode, BundleGraphNode, Environment} from './types';
import {bundleGraphEdgeTypes} from './BundleGraph';
import {requestGraphEdgeTypes} from './RequestTracker';

import path from 'path';
import {fromProjectPathRelative} from './projectPath';
import {SpecifierType, Priority} from './types';
import {Graph as GraphVizGraph} from 'graphviz/lib/deps/graph';

const COLORS = {
  root: 'gray',
  asset: 'green',
  dependency: 'orange',
  transformer_request: 'cyan',
  file: 'gray',
  default: 'white',
};

const TYPE_COLORS = {
  bundle: 'blue',
  contains: 'grey',
  internal_async: 'orange',
  references: 'red',
  sibling: 'green',
  invalidated_by_create: 'green',
  invalidated_by_create_above: 'orange',
  invalidate_by_update: 'cyan',
  invalidated_by_delete: 'red',
};

export default function dumpGraphToGraphViz(
  // $FlowFixMe
  graph: Graph<AssetGraphNode> | Graph<BundleGraphNode>,
  name: string,
  edgeTypes?: typeof bundleGraphEdgeTypes | typeof requestGraphEdgeTypes,
): void {
  if (
    !(
      /* $FlowFixMe*/ (
        (process.browser && globalThis.PARCEL_DUMP_GRAPHVIZ?.mode != null) ||
        (process.env.PARCEL_BUILD_ENV !== 'production' &&
          process.env.PARCEL_DUMP_GRAPHVIZ != null &&
          // $FlowFixMe
          process.env.PARCEL_DUMP_GRAPHVIZ != false)
      )
    )
  ) {
    return;
  }
  // $FlowFixMe
  let detailedSymbols = globalThis.PARCEL_DUMP_GRAPHVIZ?.mode === 'symbols';

  // const graphviz = require('graphviz');
  // const tempy = require('tempy');
  // let g = graphviz.digraph('G');
  let g = new GraphVizGraph(null, 'G');
  g.type = 'digraph';
  for (let [id, node] of graph.nodes) {
    let n = g.addNode(nodeId(id));
    // $FlowFixMe default is fine. Not every type needs to be in the map.
    n.set('color', COLORS[node.type || 'default']);
    n.set('shape', 'box');
    n.set('style', 'filled');
    let label = `${node.type || 'No Type'}: [${node.id}]: `;
    if (node.type === 'dependency') {
      label += node.value.specifier;
      let parts = [];
      if (node.value.priority !== Priority.sync)
        parts.push(node.value.priority);
      if (node.value.isOptional) parts.push('optional');
      if (node.value.specifierType === SpecifierType.url) parts.push('url');
      if (node.hasDeferred) parts.push('deferred');
      if (node.excluded) parts.push('excluded');
      if (parts.length) label += ' (' + parts.join(', ') + ')';
      if (node.value.env) label += ` (${getEnvDescription(node.value.env)})`;
      let depSymbols = node.value.symbols;
      if (detailedSymbols) {
        if (depSymbols) {
          if (depSymbols.size) {
            label +=
              '\\nsymbols: ' +
              [...depSymbols].map(([e, {local}]) => [e, local]).join(';');
          }
          let weakSymbols = [...depSymbols]
            .filter(([, {isWeak}]) => isWeak)
            .map(([s]) => s);
          if (weakSymbols.length) {
            label += '\\nweakSymbols: ' + weakSymbols.join(',');
          }
          if (node.usedSymbolsUp.size > 0) {
            label += '\\nusedSymbolsUp: ' + [...node.usedSymbolsUp].join(',');
          }
          if (node.usedSymbolsDown.size > 0) {
            label +=
              '\\nusedSymbolsDown: ' + [...node.usedSymbolsDown].join(',');
          }
        } else {
          label += '\\nsymbols: cleared';
        }
      }
    } else if (node.type === 'asset') {
      label +=
        path.basename(fromProjectPathRelative(node.value.filePath)) +
        '#' +
        node.value.type;
      if (detailedSymbols) {
        if (!node.value.symbols) {
          label += '\\nsymbols: cleared';
        } else if (node.value.symbols.size) {
          label +=
            '\\nsymbols: ' +
            [...node.value.symbols].map(([e, {local}]) => [e, local]).join(';');
        }
        if (node.usedSymbols.size) {
          label += '\\nusedSymbols: ' + [...node.usedSymbols].join(',');
        }
      }
    } else if (node.type === 'asset_group') {
      if (node.deferred) label += '(deferred)';
      // $FlowFixMe
    } else if (node.type === 'file') {
      label += path.basename(node.value.filePath);
      // $FlowFixMe
    } else if (node.type === 'transformer_request') {
      label +=
        path.basename(node.value.filePath) +
        ` (${getEnvDescription(node.value.env)})`;
      // $FlowFixMe
    } else if (node.type === 'bundle') {
      let parts = [];
      if (node.value.needsStableName) parts.push('stable name');
      if (node.value.bundleBehavior) parts.push(node.value.bundleBehavior);
      if (parts.length) label += ' (' + parts.join(', ') + ')';
      if (node.value.env) label += ` (${getEnvDescription(node.value.env)})`;
      // $FlowFixMe
    } else if (node.type === 'request') {
      label = node.value.type + ':' + node.id;
    }
    n.set('label', label);
  }

  let edgeNames;
  if (edgeTypes) {
    edgeNames = Object.fromEntries(
      Object.entries(edgeTypes).map(([k, v]) => [v, k]),
    );
  }

  for (let edge of graph.getAllEdges()) {
    let gEdge = g.addEdge(nodeId(edge.from), nodeId(edge.to));
    let color = null;
    if (edge.type != 1 && edgeNames) {
      color = TYPE_COLORS[edgeNames[edge.type]];
    }
    if (color != null) {
      gEdge.set('color', color);
    }
  }
  // $FlowFixMe
  if (process.browser) {
    // $FlowFixMe
    globalThis.PARCEL_DUMP_GRAPHVIZ(name, g.to_dot());
  } else {
    // const tempy = require('tempy');
    // let tmp = tempy.file({name: `${name}.png`});
    // await g.output('png', tmp);
    // eslint-disable-next-line no-console
    // console.log('Dumped', tmp);
  }
}

function nodeId(id) {
  // $FlowFixMe
  return `node${id}`;
}

function getEnvDescription(env: Environment) {
  let description;
  if (typeof env.engines.browsers === 'string') {
    description = `${env.context}: ${env.engines.browsers}`;
  } else if (Array.isArray(env.engines.browsers)) {
    description = `${env.context}: ${env.engines.browsers.join(', ')}`;
  } else if (env.engines.node) {
    description = `node: ${env.engines.node}`;
  } else if (env.engines.electron) {
    description = `electron: ${env.engines.electron}`;
  }

  return description ?? '';
}
