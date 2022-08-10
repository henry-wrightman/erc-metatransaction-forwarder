const { expect, use } = require('chai');
const { Contract } = require( 'ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');

use(solidity);

describe('ERC20Token', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let tokenContract;
  let owner;

  beforeEach(async () => {
    const token = await ethers.getContractFactory("ERC20Token");
    tokenContract = await token.deploy(); // only argument is potential lock proxy address for bridging
    await tokenContract.deployed();
    [owner] = await ethers.getSigners();
  });

  it('Assigns initial balance', async () => {
    expect(await tokenContract.balanceOf(owner.address)).to.equal(10000000000); // 10000000000 is initial token supply
  });

  it('Transfer emits event', async () => {
    await expect(tokenContract.transfer(walletTo.address, 7))
      .to.emit(tokenContract, 'Transfer')
      .withArgs(owner.address, walletTo.address, 7);
  });

  it('Can not transfer above the amount', async () => {
    await expect(tokenContract.transfer(walletTo.address, 10000000001))
      .to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'ERC20: transfer amount exceeds balance'");
  });

  it('Send transaction changes receiver balance', async () => {
    await expect(() => wallet.sendTransaction({to: walletTo.address, gasPrice: 0, value: 200}))
      .to.changeBalance(walletTo, 200);
  });

  it('Send transaction changes sender and receiver balances', async () => {
    await expect(() =>  wallet.sendTransaction({to: walletTo.address, gasPrice: 0, value: 200}))
      .to.changeBalances([wallet, walletTo], [-200, 200]);
  });
});