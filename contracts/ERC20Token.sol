// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Token is ERC20, Ownable {
  using SafeMath for uint256;

  constructor() ERC20("MetaToken", "MTX") {
    _mint(msg.sender, 10000000000);
  }

  // receive
  receive () payable external { }

  function decimals() public view virtual override returns (uint8) {
      return 4;
  }
}
