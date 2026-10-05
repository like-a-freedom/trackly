import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const origin='http://localhost:81/';
test('real account refresh, nickname and deletion',async({page,context},testInfo)=>{
  const output=`/private/tmp/trackly-acceptance-${randomUUID()}.json`;
  const backend=resolve(import.meta.dirname,'../../backend');
  execFileSync('cargo',['run','--locked','--example','acceptance_account','--',output],{cwd:backend,stdio:'pipe'});
  const fixture=JSON.parse(await readFile(output,'utf8'));
  await unlink(output);
  try {
    await context.addCookies([{name:'refresh_token',value:fixture.refresh,domain:'localhost',path:'/api/auth',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const refreshed=page.waitForResponse(r=>r.url().endsWith('/api/auth/refresh')&&r.status()===200);
    await page.goto(origin+'account');
    const token=(await (await refreshed).json()).access_token;
    for (let i=0;i<2;i++) {
      const id=randomUUID(); const lon=37.5+parseInt(id.slice(0,4),16)/10000000;
      const response=await page.request.post(origin+'api/tracks/create',{headers:{Authorization:`Bearer ${token}`},data:{request_id:id,name:`Acceptance route ${i}`,geometry:{type:'MultiLineString',coordinates:[[[lon,56.34],[lon+.001,56.341]]]},categories:['walking']}});
      expect(response.status()).toBe(201);
    }
    await expect(page.getByText('Acceptance user',{exact:true})).toBeVisible({timeout:20000});
    await page.reload();
    await expect(page.getByText('Acceptance user',{exact:true})).toBeVisible();
    await expect(page.getByText('Acceptance route 0',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Edit Nickname',exact:true}).click();
    await page.getByLabel('Nickname',{exact:true}).fill(`qa_${fixture.id.slice(0,8)}`);
    const update=page.waitForResponse(r=>r.url().endsWith('/api/auth/me/nickname') && r.request().method()==='PATCH');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    expect((await update).ok()).toBe(true);
    await expect(page.getByRole('dialog',{name:'Edit nickname',exact:true})).toBeHidden();
    await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    await testInfo.attach('account-axe',{body:JSON.stringify(axe),contentType:'application/json'});
    await page.screenshot({path:`../docs/audit/2026-10-04-design-evidence/implementation/live-account-${testInfo.project.name}.png`});
    expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))).toEqual([]);
    await page.getByLabel('Search tracks',{exact:true}).fill('route 0');
    await page.getByRole('checkbox',{name:'Select shown tracks',exact:true}).check();
    const toggle=page.waitForResponse(r=>r.url().endsWith('/api/account/tracks/bulk/visibility')&&r.request().method()==='PATCH');
    await page.getByRole('button',{name:'Toggle visibility (1)',exact:true}).click();
    const changed=await (await toggle).json(); expect(changed.updated).toHaveLength(1);
    await expect(page.getByRole('button',{name:'Make public',exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:'Select shown tracks',exact:true}).check();
    await page.getByRole('button',{name:'Delete (1)',exact:true}).click();
    const bulkDeleted=page.waitForResponse(r=>r.url().endsWith('/api/account/tracks/bulk')&&r.request().method()==='DELETE');
    await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
    expect((await (await bulkDeleted).json()).deleted).toHaveLength(1);
    await page.getByRole('button',{name:'Clear search',exact:true}).click();
    await expect(page.getByText('Acceptance route 1',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Delete Account',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(page.getByText('Acceptance user',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Delete Account',exact:true}).click();
    const deleted=page.waitForResponse(r=>r.url().endsWith('/api/account')&&r.request().method()==='DELETE');
    await page.getByRole('dialog').getByRole('button',{name:'Delete Account',exact:true}).click();
    expect((await deleted).ok()).toBe(true);
    await expect(page).toHaveURL(origin);
    await page.reload();
    await expect(page.getByRole('button',{name:'Sign in with Google'})).toBeVisible();
  } finally {execFileSync('cargo',['run','--locked','--example','acceptance_account','--','delete',fixture.id],{cwd:backend,stdio:'pipe'});}
});

test('real session logout reports server failure and permits retry',async({page,context})=>{
 const output=`/private/tmp/trackly-acceptance-${randomUUID()}.json`;
 const backend=resolve(import.meta.dirname,'../../backend');
 execFileSync('cargo',['run','--locked','--example','acceptance_account','--',output],{cwd:backend,stdio:'pipe'});
 const fixture=JSON.parse(await readFile(output,'utf8'));await unlink(output);
 try {
  await context.addCookies([{name:'refresh_token',value:fixture.refresh,domain:'localhost',path:'/api/auth',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await page.goto(origin+'account');
  await expect(page.getByText('Acceptance user',{exact:true})).toBeVisible();
  await page.route('**/api/auth/logout',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Sign Out',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('server logout could not be confirmed');
  await expect(page.getByText('Sign in to view your tracks', {exact:true})).toBeVisible();
  await expect(page.getByText("You don't have any tracks yet", {exact:true})).toHaveCount(0);
  await page.unroute('**/api/auth/logout');
  const loggedOut=page.waitForResponse(r=>r.url().endsWith('/api/auth/logout')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  expect((await loggedOut).ok()).toBe(true);
  await expect(page).toHaveURL(origin);
  await page.reload();
  await expect(page.getByRole('button',{name:'Sign in with Google'})).toBeVisible();
 } finally {execFileSync('cargo',['run','--locked','--example','acceptance_account','--','delete',fixture.id],{cwd:backend,stdio:'pipe'});}
});
