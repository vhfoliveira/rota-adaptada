import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync('python3',[fileURLToPath(new URL('./zarc-service.py',import.meta.url)),'--once'],{stdio:'inherit',env:{...process.env,ZARC_OUTPUT:fileURLToPath(new URL('../public/zarc',import.meta.url))}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
