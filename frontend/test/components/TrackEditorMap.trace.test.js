import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import TrackEditorMap from "../../src/components/TrackEditorMap.vue";

const LMapStub = {
  name: "LMap",
  template: "<div><slot /></div>",
  emits: ["ready", "click", "mousedown", "touchstart"],
};

const SimpleStub = {
  template: "<div><slot /></div>",
};

function createMapMock() {
  const handlers = {};
  return {
    handlers,
    getZoom: vi.fn(() => 14),
    on: vi.fn((event, cb) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
    }),
    off: vi.fn((event, cb) => {
      if (!event) return;
      if (!handlers[event]) return;
      if (!cb) {
        handlers[event] = [];
        return;
      }
      handlers[event] = handlers[event].filter((handler) => handler !== cb);
    }),
    dragging: {
      enable: vi.fn(),
      disable: vi.fn(),
    },
    fire(event, payload) {
      (handlers[event] || []).forEach((cb) => cb(payload));
    },
  };
}

function mountMap(props = {}) {
  return mount(TrackEditorMap, {
    props: {
      segments: [{ points: [], waypoints: [] }],
      totalPoints: 0,
      ...props,
    },
    global: {
      stubs: {
        LMap: LMapStub,
        "l-map": LMapStub,
        LTileLayer: SimpleStub,
        LPolyline: SimpleStub,
        LCircleMarker: SimpleStub,
        LTooltip: SimpleStub,
      },
    },
  });
}

describe("TrackEditorMap trace mode", () => {
  let mapMock;
  let rafSpy;

  beforeEach(() => {
    mapMock = createMapMock();
    rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb();
        return 1;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("starts trace on mousedown and adds points on move", async () => {
    const wrapper = mountMap({ editorMode: "trace" });
    const mapWrapper = wrapper.findComponent({ ref: "mapRef" });
    mapWrapper.vm.$emit("ready", mapMock);

    mapWrapper.vm.$emit("mousedown", {
      latlng: { lat: 10, lng: 10 },
    });

    expect(wrapper.emitted("addWaypoint")).toBeTruthy();
    expect(wrapper.emitted("addWaypoint")[0]).toEqual([10, 10]);
    expect(mapMock.dragging.disable).toHaveBeenCalled();

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(200).mockReturnValueOnce(400);

    mapMock.fire("mousemove", { latlng: { lat: 10.001, lng: 10.001 } });
    mapMock.fire("mousemove", { latlng: { lat: 10.002, lng: 10.002 } });

    const emitted = wrapper.emitted("addWaypoint");
    expect(emitted.length).toBeGreaterThanOrEqual(2);

    mapMock.fire("mouseup", {});
    expect(mapMock.dragging.enable).toHaveBeenCalled();
  });

  it("ignores click when in trace mode", async () => {
    const wrapper = mountMap({ editorMode: "trace" });
    const mapWrapper = wrapper.findComponent({ ref: "mapRef" });
    mapWrapper.vm.$emit("ready", mapMock);

    mapWrapper.vm.$emit("click", {
      latlng: { lat: 10, lng: 10 },
    });

    expect(wrapper.emitted("addWaypoint")).toBeFalsy();
  });

  it("stops tracing when mode changes", async () => {
    const wrapper = mountMap({ editorMode: "trace" });
    const mapWrapper = wrapper.findComponent({ ref: "mapRef" });
    mapWrapper.vm.$emit("ready", mapMock);

    mapWrapper.vm.$emit("mousedown", {
      latlng: { lat: 10, lng: 10 },
    });

    await wrapper.setProps({ editorMode: "edit" });

    expect(mapMock.dragging.enable).toHaveBeenCalled();
  });
});
