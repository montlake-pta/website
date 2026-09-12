import { pageCollectionDefinitions } from "../scripts/page-collections.mjs";

export const templateAutomationId = "ea50b8de-0b25-446e-a80f-70765e472cef";
export const triggerAppId = "e593b0bd-b783-45b8-97c2-873d42aacaf4";
export const publisherActionMapping = {
  appId: "0468ef24-b9a1-4b85-8a7a-1a51a0321a67",
  spiId: "759a51d8-2316-48d4-a388-b93ffc344217",
  componentId: "b8984805-a886-4e30-a19b-f88b410e2eb3",
};
export const pageMutationTriggers = [
  { event: "created", triggerKey: "domain_events_wix.data.v2.data_item-created",
    filterId: "e8c0bb9c-7b28-4ad0-8c13-32905ada6a07", fieldKey: "dataCollectionId" },
  { event: "updated", triggerKey: "domain_events_wix.data.v2.data_item-updated",
    filterId: "305aa164-c14b-4c98-950c-c42d68f4493b", fieldKey: "dataCollectionId" },
  { event: "deleted", triggerKey: "domain_events_wix.data.v2.data_item-deleted",
    filterId: "5547e945-ea65-47e3-840d-2f59452d2133", fieldKey: "deletedEntity.dataCollectionId" },
];

// Native CMS triggers avoid republishing an Editor site just to register a
// collection. Each trigger's collection selector supports one collection.
export function pagePublishingAutomations(action) {
  const info = action?.appDefinedInfo;
  if (action?.type !== "APP_DEFINED" || !action.id || !action.namespace
    || Object.keys(action).some(key => !["id", "type", "namespace", "appDefinedInfo"].includes(key))
    || Object.keys(info || {}).some(key => !["appId", "actionKey", "inputMapping", "postActionIds", "skipConditionOrExpressionGroups"].includes(key))
    || info?.appId !== "139ef4fa-c108-8f9a-c7be-d5f492a2c939" || info.actionKey !== "wix_automations-velo_action"
    || Object.keys(info.inputMapping || {}).length !== 3
    || !Object.entries(publisherActionMapping).every(([key, value]) => info.inputMapping[key] === value)
    || info.postActionIds?.length || info.skipConditionOrExpressionGroups?.length) {
    throw new Error("The automation template must invoke only the existing GitHub publishing Velo action.");
  }
  return pageCollectionDefinitions.flatMap(({ id }) => pageMutationTriggers.map(trigger => ({
    name: `GitHub publish - ${id} ${trigger.event}`,
    origin: "USER",
    configuration: {
      status: "ACTIVE",
      trigger: {
        appId: triggerAppId, triggerKey: trigger.triggerKey,
        filters: [{ id: trigger.filterId, fieldKey: trigger.fieldKey,
          filterExpression: `{{contains(["${id}"];var("${trigger.fieldKey}"))}}` }],
      },
      rootActionIds: [action.id],
      actions: { [action.id]: structuredClone(action) },
    },
  })));
}
