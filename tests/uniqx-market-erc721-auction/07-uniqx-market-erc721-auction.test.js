import {
	accounts, assert, BigNumber, getBalanceAsync, getBalanceAsyncStr, parseAdaptTokenEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721 = artifacts.require('../../contracts/UniqxMarketERC721Auction.sol');

contract('Testing buy now - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarket;
	let adaptCollectibles;

	let token;
	let buyPrice;
	let startPrice;
	let endTime;

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		uniqxMarket = await UniqxMarketERC721.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarket.address}`);

		adaptCollectibles = await AdaptCollectibles.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptCollectibles.address}`);
	});

	it('should mint a test token', async function () {

		const ret = await adaptCollectibles.mint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // copy
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		token = await adaptCollectibles.tokenByIndex(0);
		buyPrice = ether(10);
		startPrice = ether(1);
		endTime = moment().add(3, 'days').unix();
	});

	it('should register the adapt token', async function () {

		const ret = await uniqxMarket.registerToken(
			adaptCollectibles.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogRegisterToken');

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptCollectibles.setApprovalForAll(
			uniqxMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list a token', async () => {

		const rec = await uniqxMarket.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			startPrice,
			endTime,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy the tokens - too much ether', async function () {
		const priceToPay = new BigNumber(ether(11));

		const ret = await uniqxMarket.bid(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy a token', async () => {

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const priceToPay = new BigNumber(ether(10));

		const ret = await uniqxMarket.bid(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBuy');

		// TODO: get these from contract
		const marketFee = priceToPay.dividedToIntegerBy(100);
		const ownerDue = priceToPay - marketFee;

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);

		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		assert.equal(await adaptCollectibles.ownerOf(token), ac.BUYER1, 'unexpected owner  - should be buyer1');
	});

	it('BUYER2 should not be able to buy a token - token already sold to buyer1', async function () {
		const priceToPay = new BigNumber(ether(10));

		const ret = await uniqxMarket.bid(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER2,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
