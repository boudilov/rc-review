const DEPTH_RADIUS = {
  root: 0,
  tg: 1,
  workshop: 2,
  person: 3,
};

const RING_FRACTION = {
  root: 0,
  tg: 0.2,
  workshop: 0.42,
  person: 0.68,
};

/** Symmetric radial layout: leaves evenly spaced, parents centered over children. */
export function layoutTree(root, { size, padding = 48 } = {}) {
  const minSide = Math.min(size.width, size.height);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const maxR = minSide / 2 - padding;

  const leaves = [];
  collectLeaves(root, leaves);

  const leafCount = Math.max(leaves.length, 1);
  const startAngle = -Math.PI / 2;

  leaves.forEach((leaf, index) => {
    leaf._angle = startAngle + (index / leafCount) * Math.PI * 2;
  });

  assignAngles(root);
  assignCoords(root, 0, cx, cy, maxR);

  return { root, cx, cy, maxR, leafCount };
}

function collectLeaves(node, out) {
  if (node.type === "person") {
    out.push(node);
    return;
  }
  for (const child of node.children || []) collectLeaves(child, out);
}

function assignAngles(node) {
  if (node.type === "person") {
    node.angle = node._angle;
    return node.angle;
  }

  const childAngles = (node.children || []).map(assignAngles);
  node.angle = childAngles.reduce((a, b) => a + b, 0) / childAngles.length;
  return node.angle;
}

function assignCoords(node, depth, cx, cy, maxR) {
  const ring = RING_FRACTION[node.type] ?? RING_FRACTION.person;
  node.radius = maxR * ring;
  node.x = cx + node.radius * Math.cos(node.angle);
  node.y = cy + node.radius * Math.sin(node.angle);
  node.depth = DEPTH_RADIUS[node.type] ?? depth;

  for (const child of node.children || []) {
    assignCoords(child, depth + 1, cx, cy, maxR);
  }
}

export function collectLinks(node, links = []) {
  for (const child of node.children || []) {
    links.push({ source: node, target: child });
    collectLinks(child, links);
  }
  return links;
}

export function flattenNodes(node, list = []) {
  list.push(node);
  for (const child of node.children || []) flattenNodes(child, list);
  return list;
}
