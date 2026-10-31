import unittest

from app.brief import apply_patch, empty_brief, make_change_event


class BriefTests(unittest.TestCase):
    def test_confirmed_patch_increments_revision_and_replaces_tentative(self):
        brief = apply_patch(empty_brief(), {"tentative": {"color": "米白色"}})
        updated = apply_patch(brief, {"confirmed": {"color": "暖米白"}}, source={"segment_id": "seg_1"})
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["confirmed_constraints"]["color"]["value"], "暖米白")
        self.assertNotIn("color", updated["tentative_preferences"])

    def test_change_event_preserves_explicit_fields(self):
        event = make_change_event(
            patch={"collar": "smaller"},
            preserve=["color", "fit", "length"],
            source={"segment_id": "seg_2"},
            base_revision="V1",
        )
        self.assertEqual(event["type"], "MODIFY_ATTRIBUTE")
        self.assertIn("color", event["preserve"])
        self.assertEqual(event["base_revision"], "V1")


if __name__ == "__main__":
    unittest.main()
