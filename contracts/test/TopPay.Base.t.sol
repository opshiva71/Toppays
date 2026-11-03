// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TopPay} from "../TopPay.sol";

/// @dev Accepts native funds.
contract Acceptor {
    receive() external payable {}
}

/// @dev Always rejects native funds.
contract Rejecter {
    receive() external payable {
        revert("nope");
    }
}

/// @dev No receive/fallback: plain value transfers revert.
contract NoReceive {
    function ping() external {}
}

/// @dev Burns every unit of gas it is given.
contract GasBurner {
    uint256 public x;

    receive() external payable {
        while (true) {
            x++;
        }
    }
}

/// @dev Re-enters a target on receive. `propagate` bubbles the inner revert, otherwise it is swallowed.
///      Also acts as a generic caller (`exec`) so it can be payer/payee/requester of TopPay objects.
contract Reentrant {
    address public target;
    bytes public data;
    uint256 public value;
    bool public propagate;
    bool public entered;
    bool public innerOk;
    bytes public innerRet;

    function configure(address t, bytes calldata d, uint256 v, bool p) external {
        target = t;
        data = d;
        value = v;
        propagate = p;
        entered = false;
        innerOk = false;
        delete innerRet;
    }

    function exec(address t, bytes calldata d) external payable returns (bytes memory ret) {
        bool ok;
        (ok, ret) = t.call{value: msg.value}(d);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        innerOk = ok;
        innerRet = ret;
        if (!ok && propagate) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}

/// @dev Calls sendBatchBestEffort but has no receive(), so it cannot take the refund.
contract NoRefundSender {
    function go(
        TopPay a,
        address payable[] calldata tos,
        uint256[] calldata amounts,
        bytes32[] calldata memos,
        uint256 g
    ) external payable returns (uint256) {
        return a.sendBatchBestEffort{value: msg.value}(tos, amounts, memos, g);
    }
}

abstract contract TopPayTestBase is Test {
    TopPay internal arc;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    uint256 internal constant T0 = 1_700_000_000;
    bytes32 internal constant MEMO = keccak256("memo");

    function setUp() public virtual {
        vm.warp(T0);
        arc = new TopPay();
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(carol, 1_000 ether);
        vm.deal(dave, 1_000 ether);
    }

    // ---------- array helpers ----------
    function _t1(address a) internal pure returns (address payable[] memory r) {
        r = new address payable[](1);
        r[0] = payable(a);
    }

    function _t2(address a, address b) internal pure returns (address payable[] memory r) {
        r = new address payable[](2);
        r[0] = payable(a);
        r[1] = payable(b);
    }

    function _t3(address a, address b, address c) internal pure returns (address payable[] memory r) {
        r = new address payable[](3);
        r[0] = payable(a);
        r[1] = payable(b);
        r[2] = payable(c);
    }

    function _a1(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _a2(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    function _a3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory r) {
        r = new uint256[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    /// @dev n memos, memo i = bytes32(i + 1)
    function _m(uint256 n) internal pure returns (bytes32[] memory r) {
        r = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            r[i] = bytes32(i + 1);
        }
    }

    /// @dev n fresh EOA recipients at 0x100000 + i.
    function _fresh(uint256 n) internal pure returns (address payable[] memory r) {
        r = new address payable[](n);
        for (uint256 i; i < n; i++) {
            r[i] = payable(address(uint160(0x100000 + i)));
        }
    }

    function _same(uint256 n, uint256 amt) internal pure returns (uint256[] memory r) {
        r = new uint256[](n);
        for (uint256 i; i < n; i++) {
            r[i] = amt;
        }
    }

    function _sum(uint256[] memory a) internal pure returns (uint256 s) {
        for (uint256 i; i < a.length; i++) {
            s += a[i];
        }
    }

    // ---------- escrow / request helpers ----------
    function _mkEscrow(address payer, address payee, uint256 amount, uint256 duration) internal returns (uint256 id) {
        vm.prank(payer);
        id = arc.createEscrow{value: amount}(payee, uint64(block.timestamp + duration), MEMO);
    }

    function _mkRequest(address payee, address payer, uint256 amount, uint64 expiry) internal returns (uint256 id) {
        vm.prank(payee);
        id = arc.createRequest(payer, amount, expiry, MEMO);
    }
}
