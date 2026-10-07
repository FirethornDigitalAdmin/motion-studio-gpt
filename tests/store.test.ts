import { it, expect } from "vitest";
import { useStore } from "../src/store";
import { emptyProject } from "../src/model";

it("opens schema-normalized projects as saved, including older files with defaulted pose data", () => {
  const project = emptyProject();
  delete (project as Partial<typeof project>).poses;
  useStore.getState().open(project, "Legacy.motion");
  const state = useStore.getState();
  expect(state.project.poses).toEqual([]);
  expect(JSON.stringify(state.project)).toBe(state.saved);
  useStore.getState().open(emptyProject(), null);
  expect(JSON.stringify(useStore.getState().project)).toBe(
    useStore.getState().saved,
  );
});
