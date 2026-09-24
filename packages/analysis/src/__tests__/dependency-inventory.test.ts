import { describe, expect, it } from "vitest";
import { PACKAGE_INVENTORY_LIMIT, listPackageCoordinates, listPackageInventory, sbomToCycloneDx } from "../dependency-inventory.js";

describe("listPackageCoordinates", () => {
  it("keeps direct and transitive npm packages and marks a source import", () => {
    const components = listPackageCoordinates(
      new Map([
        ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.15" } })],
        [
          "package-lock.json",
          JSON.stringify({
            packages: {
              "node_modules/lodash": { version: "4.17.15" },
              "node_modules/lodash/node_modules/left-pad": { version: "1.3.0" },
            },
          }),
        ],
        ["src/app.ts", "import lodash from \"lodash\";\n"],
      ]),
    );
    const lodash = components.find((component) => component.name === "lodash");
    const leftPad = components.find((component) => component.name === "left-pad");
    expect(lodash?.scope).toBe("direct");
    expect(lodash?.referencedInSource).toBe(true);
    expect(leftPad?.scope).toBe("transitive");
    expect(leftPad?.purl).toBe("pkg:npm/left-pad@1.3.0");
  });

  it("does not treat a package name in a comment as source usage", () => {
    const components = listPackageCoordinates(
      new Map([
        ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.15", axios: "1.6.0" } })],
        [
          "package-lock.json",
          JSON.stringify({
            packages: {
              "node_modules/lodash": { version: "4.17.15" },
              "node_modules/axios": { version: "1.6.0" },
            },
          }),
        ],
        ["src/app.ts", "import axios from \"axios\";\n// import lodash from \"lodash\";\n/* require(\"lodash\") */\n"],
        ["notes.py", "# import requests\n"],
      ]),
    );
    expect(components.find((component) => component.name === "axios")?.referencedInSource).toBe(true);
    expect(components.find((component) => component.name === "lodash")?.referencedInSource).toBe(false);
  });

  it("keeps an imported package when the lockfile passes the inventory limit", () => {
    const packages: Record<string, { version: string }> = {
      "node_modules/lodash": { version: "4.17.15" },
    };
    for (let index = 0; index < PACKAGE_INVENTORY_LIMIT; index += 1) {
      packages[`node_modules/pkg-${String(index).padStart(4, "0")}`] = { version: "1.0.0" };
    }
    const inventory = listPackageInventory(
      new Map([
        ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.15" } })],
        ["package-lock.json", JSON.stringify({ packages })],
        ["src/app.ts", "import lodash from \"lodash\";\n"],
      ]),
    );
    expect(inventory.components).toHaveLength(PACKAGE_INVENTORY_LIMIT);
    expect(inventory.omittedCount).toBe(1);
    expect(inventory.components.some((component) => component.name === "lodash")).toBe(true);
  });

  it("reads Poetry, Cargo, and Maven lock coordinates", () => {
    const components = listPackageCoordinates(
      new Map([
        ["poetry.lock", "[[package]]\nname = \"requests\"\nversion = \"2.31.0\"\n"],
        ["Cargo.lock", "[[package]]\nname = \"serde\"\nversion = \"1.0.210\"\n"],
        [
          "pom.xml",
          "<dependency><groupId>org.apache.logging.log4j</groupId><artifactId>log4j-core</artifactId><version>2.14.1</version></dependency>",
        ],
      ]),
    );
    expect(components.map((component) => component.ecosystem).sort()).toEqual(["Maven", "PyPI", "crates.io"]);
    expect(components.find((component) => component.name === "serde")?.purl).toBe("pkg:cargo/serde@1.0.210");
  });
});

describe("sbomToCycloneDx", () => {
  it("writes a CycloneDX document for the inventory", () => {
    const document = JSON.parse(
      sbomToCycloneDx(
        [
          {
            ecosystem: "npm",
            name: "lodash",
            version: "4.17.15",
            manifestPath: "package-lock.json",
            scope: "direct",
            purl: "pkg:npm/lodash@4.17.15",
            referencedInSource: true,
          },
        ],
        "urn:uuid:test",
      ),
    ) as { bomFormat: string; components: Array<{ purl: string }> };
    expect(document.bomFormat).toBe("CycloneDX");
    expect(document.components[0]?.purl).toBe("pkg:npm/lodash@4.17.15");
  });
});
