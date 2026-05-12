import test from "node:test";
import assert from "node:assert/strict";
import { extractItineraryDaysFromRoutePayload } from "./api-client";

test("extract prefers timeline over orchestration days", () => {
  const payload = {
    timeline: [
      {
        date: "2026-06-01",
        items: [
          {
            id: "i1",
            type: "POI",
            start_window: "09:00",
            end_window: "11:00",
            location_ref: { place_id: "381112", name: "Krossá", address: "Þórshmerkurvegur" },
          },
        ],
      },
    ],
    orchestrationResult: {
      itinerary: {
        days: [{ date: "ignored", items: [] }],
      },
    },
  };
  const days = extractItineraryDaysFromRoutePayload(payload);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-06-01");
  assert.equal(days[0].items[0].name, "Krossá");
  assert.equal(days[0].items[0].place_id, "381112");
});

test("extract falls back to orchestrationResult.itinerary.days when timeline empty", () => {
  const payload = {
    timeline: [],
    orchestrationResult: {
      itinerary: {
        days: [
          {
            date: "2026-06-02",
            items: [
              {
                type: "POI",
                start_window: "17:00",
                end_window: "19:00",
                location_ref: { name: "Landmannalaugar", address: "Laugavegur" },
              },
            ],
          },
        ],
      },
    },
  };
  const days = extractItineraryDaysFromRoutePayload(payload);
  assert.equal(days.length, 1);
  assert.equal(days[0].items[0].name, "Landmannalaugar");
});
