import { invoke as publishWebsite } from "backend/___spi___/automations-velo-action-provider/github-publish/github-publish";

// Published Velo backend handlers, not SDK event registrations. Entity payloads
// are deliberately not passed to GitHub or printed in logs.
export async function wixBlog_onPostCreated() { return publishWebsite(); }
export async function wixBlog_onPostUpdated() { return publishWebsite(); }
export async function wixBlog_onPostDeleted() { return publishWebsite(); }

export async function wixEvents_onEventCreated() { return publishWebsite(); }
export async function wixEvents_onEventUpdated() { return publishWebsite(); }
export async function wixEvents_onEventCanceled() { return publishWebsite(); }
export async function wixEvents_onEventDeleted() { return publishWebsite(); }

export async function wixStores_onProductCreated() { return publishWebsite(); }
export async function wixStores_onProductUpdated() { return publishWebsite(); }
export async function wixStores_onProductDeleted() { return publishWebsite(); }
export async function wixStores_onVariantsUpdated() { return publishWebsite(); }
export async function wixStores_onInventoryVariantUpdated() { return publishWebsite(); }
export async function wixStores_onInventoryItemUpdated() { return publishWebsite(); }
export async function wixStores_onCollectionCreated() { return publishWebsite(); }
export async function wixStores_onCollectionUpdated() { return publishWebsite(); }
export async function wixStores_onCollectionDeleted() { return publishWebsite(); }
