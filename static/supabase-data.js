(() => {
  "use strict";

  const config = window.RMS_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
    throw new Error("Supabase is not configured. Check the project URL, publishable key, and Supabase client script.");
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
  });

  async function request(path, body) {
    const {data, error} = await client.rpc("rms_request", {
      p_path: path,
      p_body: body ?? {}
    });
    if (error) throw new Error(error.message || "Supabase request failed");
    return data;
  }

  async function login(email, password) {
    const {data, error} = await client.auth.signInWithPassword({email, password});
    if (error) throw new Error(error.message);
    return request("/me");
  }

  async function openCustomerSession() {
    let {data, error} = await client.auth.getSession();
    if (error) throw new Error(error.message);
    if (!data.session) {
      ({data, error} = await client.auth.signInAnonymously());
      if (error) throw new Error(error.message);
    }
    return request("/me");
  }

  async function signOut() {
    const {error} = await client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function changePassword(password) {
    const {error} = await client.auth.updateUser({password});
    if (error) throw new Error(error.message);
  }

  async function uploadImage({kind, menu_id, mime, data}) {
    const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
    const extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime];
    if (!extension) throw new Error("Use a JPG, PNG or WebP image");
    const path = `${crypto.randomUUID()}.${extension}`;
    const {error: uploadError} = await client.storage.from("rms-uploads").upload(path, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) throw new Error(uploadError.message);

    try {
      const storefront = await request("/storefront/image", {kind, menu_id, path});
      return {url: `/uploads/${path}`, storefront};
    } catch (error) {
      const {error: cleanupError} = await client.storage.from("rms-uploads").remove([path]);
      if (cleanupError) console.error("Could not remove an unlinked upload:", cleanupError.message);
      throw error;
    }
  }

  async function removeImage(kind, menu_id) {
    const previous = await request("/storefront");
    const oldPath = kind === "menu" ? previous.menu_images?.[menu_id] : previous[`${kind}_image`];
    const storefront = await request("/storefront/image/remove", {kind, menu_id});
    if (typeof oldPath === "string" && oldPath.startsWith("/uploads/")) {
      const {error} = await client.storage.from("rms-uploads").remove([oldPath.slice("/uploads/".length)]);
      if (error) throw new Error("Image setting was cleared, but its stored file could not be removed: " + error.message);
    }
    return storefront;
  }

  function image(path) {
    if (typeof path !== "string" || !path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const match = path.match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
    if (!match) return "";
    return client.storage.from("rms-uploads").getPublicUrl(match[1]).data.publicUrl;
  }

  window.rmsSupabase = {client, request, login, openCustomerSession, signOut, changePassword, uploadImage, removeImage, image};
})();
