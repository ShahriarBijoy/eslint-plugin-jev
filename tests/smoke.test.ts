import plugin from "../src/index.js";

describe("plugin object", () => {
  it("has meta, rules and configs", () => {
    expect(plugin.meta.name).toBe("eslint-plugin-jev");
    expect(plugin.meta.namespace).toBe("jev");
    expect(typeof plugin.rules).toBe("object");
    expect(Array.isArray(plugin.configs.recommended)).toBe(true);
  });
});
