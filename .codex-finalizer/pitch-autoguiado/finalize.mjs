import path from 'node:path';
import {pathToFileURL} from 'node:url';
const skill='/home/voliveira/.codex/plugins/cache/openai-primary-runtime/presentations/26.1112.11011/skills/presentations';
const root='/home/voliveira/Documents/ChatGPT/Nasa';
process.env.RUNTIME_NODE_MODULES='/home/voliveira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const hasScreenshot=process.argv.includes('--screenshot');
const finalName=process.argv.find(arg=>arg.endsWith('.pptx'))||'rota-adaptada-pitch.pptx';
const result=await finalizePresentation({
 explicitTotalSlideCount:7,
 materializeLiteralChartWorkbooks:true,
 requiredNativeTableOwnerSlides:hasScreenshot?[2]:[2,4],
 requiredNativeChartOwnerSlides:[5],
 workspaceDir:root,
 candidatePath:`${root}/.codex-finalizer/pitch-autoguiado/candidate.pptx`,
 finalPath:`${root}/output/pitch-autoguiado/${finalName}`,
 pythonExecutable:'/home/voliveira/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...(hasScreenshot?[2]:[2,4]).flatMap(n=>['--require-native-table-slide',String(n)])],
 fontPolicy:{basis:'design',families:['Liberation Sans']},
 verifyArtifactToolImport:true,
 receiptPath:`${root}/.codex-finalizer/pitch-autoguiado/${finalName}.validation.json`
});
console.log(JSON.stringify(result));
