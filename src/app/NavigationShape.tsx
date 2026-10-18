// A shuffled family of soft Material-inspired silhouettes. Shapes are fixed for
// this session; navigation and rerenders never reshuffle an existing button.
const variants = [0, 1, 2, 3, 4, 5];
for (let i = variants.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [variants[i], variants[j]] = [variants[j], variants[i]];
}
export function shapePath(variant: number): string {
  const recipes = [
    { lobes: 10, depth: 0.055, power: 0.62 },
    { lobes: 8, depth: 0.075, power: 0.66 },
    { lobes: 6, depth: 0.065, power: 0.58 },
    { lobes: 4, depth: 0.1, power: 0.7 },
    { lobes: 12, depth: 0.04, power: 0.58 },
    { lobes: 6, depth: 0.045, power: 0.83 },
  ];
  const recipe = recipes[((variant % recipes.length) + recipes.length) % recipes.length];
  const points = Array.from({ length: 80 }, (_, i) => {
    const angle = (i / 80) * Math.PI * 2;
    const radius = (1 + recipe.depth * Math.cos(recipe.lobes * angle)) / (1 + recipe.depth);
    const x = Math.cos(angle),
      y = Math.sin(angle);
    return [
      100 + 99 * Math.sign(x) * Math.abs(x) ** recipe.power * radius,
      22 + 21 * Math.sign(y) * Math.abs(y) ** recipe.power * radius,
    ];
  });
  // Closed Catmull-Rom spline: the outline stays smooth at every lobe.
  return (
    points
      .map((p, i) => {
        const before = points[(i + 79) % 80],
          next = points[(i + 1) % 80],
          after = points[(i + 2) % 80];
        const c1 = [p[0] + (next[0] - before[0]) / 6, p[1] + (next[1] - before[1]) / 6];
        const c2 = [next[0] - (after[0] - p[0]) / 6, next[1] - (after[1] - p[1]) / 6];
        const f = (v: number[]) => v.map((n) => n.toFixed(2)).join(' ');
        return `${i === 0 ? `M${f(p)} ` : ''}C${f(c1)} ${f(c2)} ${f(next)}`;
      })
      .join(' ') + 'Z'
  );
}
const paths = Array.from({ length: 6 }, (_, i) => shapePath(i));
export function NavigationShape({ seed }: { seed: string }) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const page = ['home', 'tracks', 'artists', 'albums', 'genres', 'favorites'].indexOf(seed);
  const variant = variants[(page >= 0 ? page : hash) % variants.length];
  return (
    <svg
      className="nav-shape"
      viewBox="0 0 200 44"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-shape={variant}
    >
      <path d={paths[variant]} />
    </svg>
  );
}
