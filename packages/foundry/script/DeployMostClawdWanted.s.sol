// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/MostClawdWanted.sol";

contract DeployMostClawdWanted is Script {
    address constant CLIENT = 0xC99F74bC7c065d8c51BD724Da898d44F775a8a19;

    function run() external {
        vm.startBroadcast();
        MostClawdWanted bountyPlatform = new MostClawdWanted(CLIENT);
        console.log("MostClawdWanted deployed at:", address(bountyPlatform));
        vm.stopBroadcast();
    }
}
