// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AnalysisWorkspacePage } from "../workspace/AnalysisWorkspacePage";
const noCipher=()=>null;
vi.mock("../session/SessionProvider",()=>({useSession:()=>({
 vaultStatus:"no_vault",getVaultCipher:noCipher,getModelApiKey:noCipher,getGithubToken:noCipher,
 providerSettings:{providerId:"gemini",modelId:"test",requestTimeoutMs:1000,maxConcurrency:1,maxRetries:0,customEndpointConfirmed:false},
 connectionTested:false,aiTransmissionConfirmed:false,hasConfiguredProviderSettings:false,
})}));
vi.mock("../ingest/useRepositoryIngestion",()=>({useRepositoryIngestion:()=>({progress:null,isLoading:false,error:null})}));
vi.mock("./DataFlowWorkbench",()=>({DataFlowWorkbench:()=>null}));
let host:HTMLDivElement;
let dispose:()=>void;
afterEach(()=>{dispose?.();host?.remove();});
it("opens a real static demo review without a model key or vault",async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);const root=createRoot(host);dispose=()=>act(()=>root.unmount());
 act(()=>root.render(<MemoryRouter><AnalysisWorkspacePage/></MemoryRouter>));
 const click=(label:string)=>{const button=[...host.querySelectorAll("button")].find(b=>b.textContent===label);if(!button)throw new Error(label);act(()=>button.click());};
 click("Inspect another workspace");
 click("Demo fixture");
 await act(async()=>{const button=host.querySelector('[data-testid="run-static-review"]') as HTMLButtonElement;expect(button.disabled).toBe(false);button.click();await new Promise(resolve=>setTimeout(resolve,100));});
 expect(host.querySelector('[data-testid="analyst-workbench"]')).not.toBeNull();
 expect(host.textContent).toContain("Scanner results");
 expect(host.textContent).toContain("Controls");
 expect(host.textContent).toContain("Review coverage");
});
