import { invoke as publishWebsite } from "backend/___spi___/automations-velo-action-provider/github-publish/github-publish";

async function publishAfterMutation(item) {
  try {
    await publishWebsite();
  } catch {
    // The content write already succeeded. Preserve the author's result while
    // reporting the failed notification; the scheduled GitHub sync is recovery.
    console.error("Wix content saved, but GitHub publishing notification failed. Inspect the publishing action; the scheduled sync remains active.");
  }
  return item;
}

export async function WebsitePages_afterInsert(item) { return publishAfterMutation(item); }
export async function WebsitePages_afterUpdate(item) { return publishAfterMutation(item); }
export async function WebsitePages_afterRemove(item) { return publishAfterMutation(item); }
export async function BoardMembers_afterInsert(item) { return publishAfterMutation(item); }
export async function BoardMembers_afterUpdate(item) { return publishAfterMutation(item); }
export async function BoardMembers_afterRemove(item) { return publishAfterMutation(item); }
