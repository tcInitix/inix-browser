import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__inixAutofill", {
  offerSave: (payload: {
    origin: string;
    username: string;
    password: string;
    title: string;
  }) => ipcRenderer.send("autofill:offer-save", payload),
  getCredentials: (origin: string) =>
    ipcRenderer.invoke("credentials:for-origin", origin) as Promise<Array<{ id: number; username: string }>>,
  getPassword: (id: number) =>
    ipcRenderer.invoke("credentials:get-password", id) as Promise<string | null>,
  getProfiles: () =>
    ipcRenderer.invoke("autofill:profiles") as Promise<
      Array<{ id: number; label: string; is_default: boolean }>
    >,
  getProfileData: (id: number) =>
    ipcRenderer.invoke("autofill:profile-data", id) as Promise<Record<string, string> | null>,
});
