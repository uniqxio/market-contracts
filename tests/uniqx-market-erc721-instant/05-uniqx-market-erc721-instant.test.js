import {
	accounts, assert, OrderStatus, BigNumber, getBalanceAsync
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
const moment = require('moment');

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721Instant = artifacts.require('../../contracts/UniqxMarketERC721Instant.sol');

contract('Testing buy now functionality - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarketInstant;
	let adaptCollectibles;

	let token;
	let buyPrice;

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		uniqxMarketInstant = await UniqxMarketERC721Instant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarketInstant.address}`);

		adaptCollectibles = await AdaptCollectibles.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptCollectibles.address}`);
	});

	it('should mint a test token', async function () {

		const ret = await adaptCollectibles.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			1,		                // count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;
	});

	it('should register the adapt token', async function () {

		const ret = await uniqxMarketInstant.registerToken(
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
			uniqxMarketInstant.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});


	it('ADAPT_ADMIN should be able to list a token for sale', async () => {

		token = await adaptCollectibles.tokenByIndex(0);
		buyPrice = ether(10);

		const rec = await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy the token - not enough ether', async function () {
		const priceToPay = new BigNumber(ether(1));

		const ret = await uniqxMarketInstant.buy(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the token - too much ether', async function () {
		const priceToPay = new BigNumber(ether(11));

		const ret = await uniqxMarketInstant.buy(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy the token', async () => {

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		const priceToPay = new BigNumber(ether(10));

		const ret = await uniqxMarketInstant.buy(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Buy 10 adapt tokens: ${ret.receipt.gasUsed}`);

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

	it('BUYER2 should not be able to buy the token - token already sold to buyer1', async function () {
		const priceToPay = new BigNumber(ether(10));

		await uniqxMarketInstant.buy(
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
