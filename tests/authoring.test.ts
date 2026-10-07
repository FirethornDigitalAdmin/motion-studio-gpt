import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer } from "../src/model";
import { applyAuthoring } from "../src/authoring";
import { evaluateRigScene } from "../src/rigging";
const setup = () => {
  const p = emptyProject(),
    l = makeLayer("rig", p);
  l.id = "actor";
  p.scenes.push({
    id: "scene",
    name: "Scene",
    start: 0,
    duration: 15,
    layers: [l],
    shots: [],
  });
  return p;
};
const batch = (commands: unknown[]) => ({
  label: "Test batch",
  expectedRevision: 0,
  commands,
});
describe("validated authoring", () => {
  it("preserves existing joint values when patching only a facial control", () => {
    const p = setup();
    p.scenes[0].layers[0].props.poseMode = "authored";
    p.scenes[0].layers[0].props.handRX = 700;
    const result = applyAuthoring(
      p,
      batch([
        { op: "setPose", layerId: "actor", time: 0, values: { headAngle: 10 } },
      ]),
    );
    expect(result.batch.commands[0]).toMatchObject({
      values: { headAngle: 10 },
    });
    expect(Object.keys((result.batch.commands[0] as any).values)).toEqual([
      "headAngle",
    ]);
    expect(
      result.project.scenes[0].layers[0].keyframes.handRX[0].value,
    ).toBeCloseTo(700, 4);
  });
  it("applies a pose and keyframes without mutating the original project", () => {
    const p = setup(),
      before = JSON.stringify(p);
    const r = applyAuthoring(
      p,
      batch([
        {
          op: "setPose",
          layerId: "actor",
          time: 1,
          values: { headAngle: 12, expression: "sceptical" },
        },
        {
          op: "setKeyframe",
          layerId: "actor",
          property: "x",
          time: 3,
          value: 800,
          easing: "ease-in-out",
        },
      ]),
    );
    expect(JSON.stringify(p)).toBe(before);
    expect(r.project.scenes[0].layers[0].keyframes.headAngle[0].value).toBe(12);
    expect(r.changes).toHaveLength(2);
  });
  it("rejects an entire batch if a later command is invalid", () => {
    const p = setup(),
      before = JSON.stringify(p);
    expect(() =>
      applyAuthoring(
        p,
        batch([
          { op: "setTransform", layerId: "actor", values: { x: 10 } },
          {
            op: "setKeyframe",
            layerId: "actor",
            property: "opacity",
            time: 3,
            value: 2,
          },
        ]),
      ),
    ).toThrow();
    expect(JSON.stringify(p)).toBe(before);
  });
  it("rejects locks, unknown properties, incompatible artwork and out-of-range timing", () => {
    const p = setup();
    p.scenes[0].layers[0].locked = true;
    expect(() =>
      applyAuthoring(
        p,
        batch([{ op: "setTransform", layerId: "actor", values: { x: 10 } }]),
      ),
    ).toThrow("locked");
    p.scenes[0].layers[0].locked = false;
    expect(() =>
      applyAuthoring(
        p,
        batch([
          {
            op: "setKeyframe",
            layerId: "actor",
            property: "bogus",
            time: 1,
            value: 2,
          },
        ]),
      ),
    ).toThrow();
    expect(() =>
      applyAuthoring(
        p,
        batch([
          {
            op: "setDrawing",
            layerId: "actor",
            slot: "head",
            assetId: "missing",
            registration: { anchorX: 0.5, anchorY: 0.9, scaleX: 1, scaleY: 1 },
          },
        ]),
      ),
    ).toThrow("Image asset not found");
    expect(() =>
      applyAuthoring(
        p,
        batch([
          {
            op: "setPose",
            layerId: "actor",
            time: 20,
            values: { headAngle: 3 },
          },
        ]),
      ),
    ).toThrow("duration");
  });
  it("creates scenes and props with explicit IDs and rejects duplicates", () => {
    const p = emptyProject();
    const commands = [
      { op: "createScene", id: "stage", name: "Stage", start: 0, duration: 5 },
      {
        op: "createLayer",
        id: "prop",
        sceneId: "stage",
        type: "shape",
        name: "Prop",
      },
      { op: "setTransform", layerId: "prop", values: { x: 600, scale: 0.2 } },
    ];
    const r = applyAuthoring(p, batch(commands));
    expect(r.project.scenes[0].layers[0].x).toBe(600);
    expect(() => applyAuthoring(r.project, batch(commands))).toThrow(
      "already exists",
    );
  });
  it("creates reusable rigs and validates contacts before committing", () => {
    const p = setup(),
      template = p.scenes[0].layers[0];
    p.rigTemplates.push({
      id: "template",
      name: "Actor",
      props: template.props,
    });
    const r = applyAuthoring(
      p,
      batch([
        {
          op: "createLayer",
          id: "second",
          sceneId: "scene",
          type: "rig",
          name: "Second",
          templateId: "template",
        },
        {
          op: "addContact",
          layerId: "second",
          contact: {
            id: "pin",
            kind: "pin",
            effector: "foot_R",
            start: 0,
            end: 3,
            worldX: 700,
            worldY: 1200,
          },
        },
        { op: "releaseContact", layerId: "second", contactId: "pin", time: 2 },
      ]),
    );
    expect(r.project.scenes[0].layers[1].props.rigConstraints[0].end).toBe(2);
    expect(() =>
      applyAuthoring(
        p,
        batch([
          {
            op: "addContact",
            layerId: "actor",
            contact: {
              id: "bad",
              kind: "carry",
              effector: "hand_R",
              targetLayerId: "missing",
              start: 0,
              end: 3,
            },
          },
        ]),
      ),
    ).toThrow("target");
  });
  it("rejects malformed batches and focus references", () => {
    const p = setup();
    expect(() =>
      applyAuthoring(p, {
        ...batch([{ op: "setTransform", layerId: "actor", values: { x: 10 } }]),
        unexpected: "bad",
      }),
    ).toThrow();
    expect(() =>
      applyAuthoring(p, {
        ...batch([{ op: "setTransform", layerId: "actor", values: { x: 10 } }]),
        view: { sceneId: "scene", layerId: "missing" },
      }),
    ).toThrow("Focus layer");
  });
  it("keeps a carried prop at its release position", () => {
    const p = setup(),
      prop = makeLayer("shape", p);
    prop.id = "prop";
    p.scenes[0].layers.push(prop);
    const carry = {
      id: "carry",
      kind: "carry",
      effector: "hand_R",
      targetLayerId: "prop",
      start: 0,
      end: 5,
      targetX: 0.5,
      targetY: 0.5,
      followRotation: true,
    };
    const held = applyAuthoring(
      p,
      batch([{ op: "addContact", layerId: "actor", contact: carry }]),
    );
    const before = evaluateRigScene(
      held.project.scenes[0],
      2 - 0.00001,
    ).layers.get("prop")!;
    const released = applyAuthoring(
      held.project,
      batch([
        { op: "releaseContact", layerId: "actor", contactId: "carry", time: 2 },
      ]),
    );
    const after = evaluateRigScene(released.project.scenes[0], 2).layers.get(
      "prop",
    )!;
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
    expect(after.rotation).toBeCloseTo(before.rotation, 4);
  });
});
