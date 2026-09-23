/**
 * balatro-jev — mock entrypoint
 */
export function main(): void {
  console.log("balatro-jev scaffold ready");
}

if (require.main === module) {
  main();
}
