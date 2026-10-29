if (
  process.env.NODE_ENV === "production" ||
  process.env.CI === "true" ||
  process.env.HUSKY === "0" ||
  process.env.npm_config_production === "true"
) {
  process.exit(0);
}
const { default: husky } = await import("husky");
const result = husky();
if (result) console.log(result);
