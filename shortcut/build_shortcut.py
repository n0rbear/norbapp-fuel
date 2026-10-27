"""Builds the unsigned "NorbApp értesítések" iPhone shortcut (binary plist).

Flow: GET the switch list -> pick lines (multi-select) -> POST them back,
which flips them -> show what changed. Run: python3 build_shortcut.py OUT
"""
import plistlib
import sys
import uuid

URL = "https://fuel.norbapp.com/api/notify/settings"
AUTH = "Basic bmltZGE6YXJhbA=="  # nimda:aral


def new_id() -> str:
    return str(uuid.uuid4()).upper()


def text(s: str) -> dict:
    return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}


def output_ref(action_uuid: str, name: str) -> dict:
    return {"OutputUUID": action_uuid, "Type": "ActionOutput", "OutputName": name}


def attachment(action_uuid: str, name: str) -> dict:
    return {"Value": output_ref(action_uuid, name), "WFSerializationType": "WFTextTokenAttachment"}


def text_with(action_uuid: str, name: str) -> dict:
    return {
        "Value": {"string": "￼", "attachmentsByRange": {"{0, 1}": output_ref(action_uuid, name)}},
        "WFSerializationType": "WFTextTokenString",
    }


def dictionary(items: list) -> dict:
    return {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}


def field(key: str, value: dict) -> dict:
    return {"WFItemType": 0, "WFKey": text(key), "WFValue": value}


def action(identifier: str, params: dict) -> dict:
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


headers = dictionary([field("Authorization", text(AUTH))])

get_id, lines_id, pick_id, join_id, post_id, changed_id, result_id = (new_id() for _ in range(7))

actions = [
    action("is.workflow.actions.comment", {
        "WFCommentActionText": "NorbApp értesítések: a kijelölt sorok átváltanak (✅ ↔ ⬜️, 🔔 ↔ 🔕). "
        "A 🔔 sorok egy egész oldalt vagy mindent némítanak.",
    }),
    action("is.workflow.actions.downloadurl", {
        "UUID": get_id,
        "WFURL": URL,
        "WFHTTPMethod": "GET",
        "ShowHeaders": True,
        "WFHTTPHeaders": headers,
    }),
    action("is.workflow.actions.getvalueforkey", {
        "UUID": lines_id,
        "WFInput": attachment(get_id, "Contents of URL"),
        "WFGetDictionaryValueType": "Value",
        "WFDictionaryKey": "lines",
    }),
    action("is.workflow.actions.choosefromlist", {
        "UUID": pick_id,
        "WFInput": attachment(lines_id, "Dictionary Value"),
        "WFChooseFromListActionSelectMultiple": True,
        "WFChooseFromListActionPrompt": "Mit kapcsoljak át?",
    }),
    action("is.workflow.actions.text.combine", {
        "UUID": join_id,
        "text": attachment(pick_id, "Chosen Item"),
        "WFTextSeparator": "New Lines",
    }),
    action("is.workflow.actions.downloadurl", {
        "UUID": post_id,
        "WFURL": URL,
        "WFHTTPMethod": "POST",
        "ShowHeaders": True,
        "WFHTTPHeaders": headers,
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": dictionary([field("keys", text_with(join_id, "Combined Text"))]),
    }),
    action("is.workflow.actions.getvalueforkey", {
        "UUID": changed_id,
        "WFInput": attachment(post_id, "Contents of URL"),
        "WFGetDictionaryValueType": "Value",
        "WFDictionaryKey": "changed",
    }),
    action("is.workflow.actions.text.combine", {
        "UUID": result_id,
        "text": attachment(changed_id, "Dictionary Value"),
        "WFTextSeparator": "New Lines",
    }),
    action("is.workflow.actions.showresult", {
        "Text": text_with(result_id, "Combined Text"),
    }),
]

shortcut = {
    "WFWorkflowClientVersion": "2302.0.4",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": [],
    "WFWorkflowTypes": [],
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": False,
    "WFQuickActionSurfaces": [],
    "WFWorkflowActions": actions,
}

with open(sys.argv[1] if len(sys.argv) > 1 else "NorbApp-ertesitesek.shortcut", "wb") as f:
    plistlib.dump(shortcut, f, fmt=plistlib.FMT_BINARY)
