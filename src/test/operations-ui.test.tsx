import {beforeEach,describe,it,expect} from 'vitest';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import {useStore} from '@/lib/store';
import {useCloud} from '@/lib/cloud-sync';
import {useSubmission} from '@/lib/confirmed-write';
import {ApprovalWorkspace,CashierPolicy,SaleReturns} from '@/components/OperationsWorkspace';
const owner={userId:'owner',name:'Sankar',role:'owner' as const};
const cashier={userId:'cashier',name:'Employee',role:'cashier' as const};
beforeEach(()=>{cleanup();localStorage.clear();useCloud.setState({shopId:null,pending:0});useSubmission.setState({busy:false});useStore.setState({role:'owner'});useStore.getState().resetAll();useStore.getState().completeSetup({shopName:'Shop',ownerPin:'1111',cashierPin:'2222',balances:{cash:1000},emptyCatalog:true});useStore.setState({actor:owner,role:'owner'});useStore.getState().openShift(1000);});
describe('operator-facing controls',()=>{
 it('saves cashier limits through the visible form',async()=>{
  render(<CashierPolicy/>);const inputs=screen.getAllByRole('textbox');fireEvent.change(inputs[0]!,{target:{value:'500'}});fireEvent.change(inputs[1]!,{target:{value:'5'}});
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'সীমা সংরক্ষণ'})));expect(useStore.getState().operations!.policy).toEqual({cashierDueLimit:500,cashierDiscountPercent:5});
 });
 it('renders approval details and executes a reviewed checkout only once',async()=>{
  useStore.getState().closeShift(1000);useStore.setState({actor:cashier,role:'cashier'});useStore.getState().openShift(1000);useStore.setState({role:'owner',actor:owner});useStore.getState().upsertProduct({name:'Cable',barcodes:['c'],price:100,cost:50,stock:2,lowStock:1});const p=useStore.getState().products[0]!;
  useStore.setState({role:'cashier',actor:cashier});useStore.getState().requestApproval('checkout',[[{productId:p.id,name:p.name,qty:1,price:100,cost:50}],[{accountId:'cash',amount:90}],undefined,{discount:10}],'Discount requested');useStore.setState({role:'owner',actor:owner});render(<ApprovalWorkspace/>);
  expect(screen.getByText('Discount requested')).toBeDefined();fireEvent.change(screen.getByPlaceholderText('সিদ্ধান্তের কারণ'),{target:{value:'Approved'}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'অনুমোদন'})));
  expect(useStore.getState().sales).toHaveLength(1);expect(screen.getByText('অনুমোদিত')).toBeDefined();expect(screen.queryByRole('button',{name:'অনুমোদন'})).toBeNull();expect(screen.getByRole('button',{name:'বিক্রির রসিদ প্রিন্ট'})).toBeDefined();
 });
 it('selects a sold serial and refunds it using the visible return form',async()=>{
  useStore.getState().upsertProduct({name:'SIM',barcodes:['s'],price:100,cost:50,stock:1,lowStock:1,serials:['ICCID-001']});const p=useStore.getState().products[0]!;const sale=useStore.getState().checkout([{productId:p.id,name:p.name,qty:1,price:100,cost:50,serials:['ICCID-001']}],[{accountId:'cash',amount:100}]);render(<SaleReturns/>);
  fireEvent.change(screen.getByLabelText('ফেরতের মেমো'),{target:{value:sale.id}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.change(screen.getByPlaceholderText('ফেরতের কারণ'),{target:{value:'Customer return'}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'ফেরত নিশ্চিত করুন'})));
  expect(useStore.getState().operations!.returns[0]!.refund).toBe(100);expect(useStore.getState().products[0]!.serials).toEqual(['ICCID-001']);
 });
});
