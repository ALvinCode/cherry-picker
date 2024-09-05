#!/usr/bin/env node

import { execSync, exec, spawn } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";

// Handle Ctrl + C (SIGINT) gracefully
process.on("SIGINT", () => {
  console.log("\nOperation aborted by user.");
  process.exit(1);
});

/**
 * Custom repositories by users
 * @returns sourceRepoUrl string
 */
async function getUserCustomRepositories() {
  try {
    let sourceRepoUrl = "";
    const { inputRepoUrl } = await inquirer.prompt([
      {
        type: "input",
        name: "newSourceRepo",
        message: "Enter the source repository URL:",
        validate: (input) =>
          input ? true : "Source repository URL is required.",
      },
    ]);
    if (checkRemoteExists(inputRepoUrl)) {
      // The library entered by the user already exists
      const { useRemote } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useRemote",
          message: `Remote repository "${inputRepoUrl}" already exists, do you want to use it?`,
          default: true,
        },
      ]);
      if (useRemote) {
        console.log(chalk.blue("Using existing remote repository"));
        // todo inputRepoUrl是否需要格式化？
        sourceRepoUrl = inputRepoUrl;
      } else {
        // If you do not use an existing remote repository, re-enter
        return getUserCustomRepositories();
      }
    } else {
      // The library entered by the user does not exist, add a new remote repository
      // TODO Get the project name through the URL, and the project name need to update globally
      try {
        console.log(chalk.greenBright("Adding from source repository..."));
        const repoName = getRepoNameFromUrl(inputRepoUrl);
        execSync(`git remote add ${repoName} ${inputRepoUrl}`, {
          stdio: "ignore",
        });
        sourceRepoUrl = inputRepoUrl;
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    }
    return sourceRepoUrl;
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 是否使用最近添加的远程存储库
async function getRepositories(lastRemoteName, lastRemoteUrl) {
  try {
    let usingRemoteUrl;
    let usingRemoteName;
    if (
      typeof lastRemoteName === "string" &&
      lastRemoteName !== "undefined" &&
      lastRemoteName !== "null" &&
      lastRemoteName
    ) {
      const { useExistingRemote } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useExistingRemote",
          message: `Use the most recently added remote repository "${lastRemoteName}"?`,
          default: true,
        },
      ]);

      if (useExistingRemote) {
        usingRemoteUrl = lastRemoteUrl;
      } else {
        usingRemoteUrl = getUserCustomRepositories();
      }
    } else {
      usingRemoteUrl = getUserCustomRepositories();
    }
    usingRemoteName = getRepoNameFromUrl(usingRemoteUrl);
    return { usingRemoteUrl, usingRemoteName };
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

/**
 * List of all connected repositories
 * Only the repository represented by fetch is retained to prompt the user and simplify the display
 * '!i.includes("origin:")' is used to filter out the local repository
 * */
function formatConnectedWarehouse(remoteArray) {
  try {
    let connectedWaarehouse = [];
    try {
      connectedWaarehouse = remoteArray
        .map((line) => line.replace("\t", ": "))
        .filter((i) => i.includes("(fetch)") && !i.includes("origin:"));
    } catch (error) {
      connectedWaarehouse = remoteArray;
    }
    console.log("Connected warehouse", connectedWaarehouse);
  } catch (error) {
    console.log("Connected warehouse", []);
  }
}

// Get the last remote repository added
function getLastRemote() {
  const defaultRemoteInfo = { lastRemoteName: null, lastRemoteUrl: null };
  try {
    const remotes = execSync("git remote -v").toString().trim();
    const remoteArray = remotes.split("\n");
    // Print the associated remote repositories;
    formatConnectedWarehouse(remoteArray);

    // Check if there is a remote repository
    if (remoteArray.length === 0) return defaultRemoteInfo;

    // Get the first remote repository containing `(fetch)`
    const firstFetchRemote = remoteArray.find((line) =>
      line.includes("(fetch)")
    );

    if (firstFetchRemote) {
      const [remoteName, remoteUrl] = firstFetchRemote.split("\t");
      const name = remoteName.split("/").pop();
      const url = remoteUrl.split(" ")[0];
      return { lastRemoteName: name, lastRemoteUrl: url };
    }
    return defaultRemoteInfo;
  } catch (error) {
    console.error("Failed to retrieve git remotes:", error);
    return defaultRemoteInfo;
  }
}

// Get the project name from the repository URL
function getRepoNameFromUrl(url) {
  try {
    const regex =
      /^(?:https?:\/\/|git@)(?:[^/:]+)[/:]([^/]+\/[^/.]+)(?:\.git)?$/i;
    const match = url.match(regex);
    console.log("match", match);
    // todo 解决这里的报错问题
    if (match) {
      // Extract the last path segment as the project name
      const repoPath = match[1];
      const repoName = repoPath.split("/").pop();
      return repoName;
    } else {
      console.log(
        "Failed to resolve project name, using default name: source-repo"
      );
      return "source-repo";
    }
  } catch (error) {
    console.log(
      "An error occurred while parsing the project name, so the default name is used: source-repo"
    );
    return "source-repo";
  }
}

// Check branch exists
function branchExists(branchName) {
  console.log(
    chalk.yellowBright(`Checking if target branch "${branchName}" exists...`)
  );
  try {
    const branches = execSync(`git branch --list ${branchName}`, {
      encoding: "utf-8",
    });
    return branches.trim() !== "";
  } catch (error) {
    console.error("Failed to check if branch exists.");
    process.exit(1);
  }
}

// Delete branch
function deleteBranch(branchName) {
  try {
    execSync(`git branch -D ${branchName}`, { stdio: "ignore" });
    console.log(
      chalk.gray(
        `Clean up temporary branches with duplicate names "${branchName}".`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(`Cleaning up temporary branch - "${branchName}" failed .`)
    );
    process.exit(1);
  }
}

// Check and work on existing branches before creating new ones
function createBranch(branchName, sourceBranch) {
  try {
    if (branchExists(branchName)) {
      deleteBranch(branchName);
      console.log();
    }

    // Create a new branch
    execSync(`git checkout -b ${branchName} ${sourceBranch}`);
    console.log(
      chalk.greenBright(
        `Create and switch to a new temporary branch - "${branchName}".`
      )
    );
    console.log();
  } catch (error) {
    console.error(
      chalk.red(
        `Failed to create and switch to a new temporary branch - "${branchName}". ${error.message}`
      )
    );
    process.exit(1);
  }
}

// Execute cherry pick
function cherryPickAndHandleConflicts(commitHash) {
  console.log(chalk.greenBright(`Cherry-picking commit ${commitHash}...`));
  return new Promise((resolve, reject) => {
    try {
      const gitProcess = spawn("git", ["cherry-pick", commitHash]);
      let statusDisplay = true;
      gitProcess.stdout.on("data", (data) => {
        console.log(`[stdout] ${data}`);
      });

      // Capture data from the standard error stream
      gitProcess.stderr.on("data", (data) => {
        console.error(`[stderr] ${data}`);

        if (statusDisplay) {
          execSync("git status", { stdio: "inherit" });
          statusDisplay = false;
        }
      });

      // Listen for command execution completion events
      gitProcess.on("close", (code) => {
        if (code === 0) {
          console.log(chalk.greenBright("Cherry-pick successful"));
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Standardize Git repository URLs to a unified HTTPS format
 * @param {string} url - Enter the repository URL
 * @returns {string} - Standardized URLs
 */
function normalizeUrl(url) {
  const sshPattern = /^git@([^:]+):([^/]+)\/(.+)\.git$/;
  const httpsPattern = /^https?:\/\/([^/]+)\/([^/]+)\/(.+)\.git$/;

  if (sshPattern.test(url)) {
    // If it is an SSH format URL (such as git@gitlab.com:user/repo.git)
    const [, host, user, repo] = RegExp(sshPattern).exec(url);
    return `https://${host}/${user}/${repo}.git`;
  } else if (httpsPattern.test(url)) {
    // If it is an HTTPS URL (such as https://gitlab.com/user/repo.git)
    const [, host, user, repo] = RegExp(httpsPattern).exec(url);
    return `https://${host}/${user}/${repo}.git`;
  } else {
    throw new Error("Invalid URL format");
  }
}

// Check whether the remote repository to be associated already exists
function checkRemoteExists(remoteRepo) {
  try {
    // Get a list of all connected remote repositories
    const remotes = execSync("git remote -v", { encoding: "utf-8" })
      .split("\n")
      .map((line) => line.split("\t")[1]) // Get URL Part
      .filter(Boolean) // Filter out empty lines
      .map((line) => line.split(" ")[0]) // Filter out the fetch/push part
      .filter(Boolean) // Filter out empty lines
      .map(normalizeUrl); // Standardized URLs

    // Standardize input repository URLs
    const normalizedInputUrl = normalizeUrl(remoteRepo);
    return remotes.includes(normalizedInputUrl);
  } catch (error) {
    console.error("Error:", error.message);
    return false;
  }
}

// Get the commit record of the remote branch
function getCommits(remoteName, branch) {
  return new Promise((resolve, reject) => {
    exec(
      `git fetch ${remoteName} ${branch} && git log ${remoteName}/${branch} --pretty=format:"%ad %an > %s - %h" --date=format:'%Y-%m-%d %H:%M:%S'`,
      (error, stdout) => {
        if (error) {
          reject(`Error fetching commits: ${error.message}`);
          return;
        }

        // Parse git log output and decompose it into an array of commit record objects
        const commits = stdout.split("\n").map((line, index) => {
          const [message, ...rest] = line.split(" - ");
          const hash = rest.join(" - ");
          const formattedMessage = index === 0 ? chalk.green(message) : message;
          return {
            name: `${formattedMessage} (${hash})`,
            value: hash.trim(),
          };
        });

        resolve(commits);
      }
    );
  });
}

const questions = {
  question1: async () => {
    const { sourceBranch } = await inquirer.prompt([
      {
        type: "input",
        name: "sourceBranch",
        message: "Enter the source branch name:",
        validate: (input) => (input ? true : "Source branch name is required."),
      },
    ]);
    return sourceBranch ? sourceBranch.trim() : "";
  },
  question2: async (repoName, sourceBranch) => {
    try {
      const commits = await getCommits(repoName, sourceBranch);
      const { selectedCommit } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedCommit",
          message: `Please select a commit record (${sourceBranch} branch):`,
          choices: commits,
          loop: false,
          pageSize: 10,
        },
      ]);
      return selectedCommit;
    } catch (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }
  },
  questions3: async () => {
    const { targetBranch } = await inquirer.prompt([
      {
        type: "input",
        name: "targetBranch",
        message: "Enter the target branch name:",
        validate: (input) => (input ? true : "Target branch name is required."),
      },
    ]);
    console.log("targetBranch", targetBranch);
    return targetBranch ? targetBranch.trim() : "";
  },
};

function printConfirmationInfo(
  repoName,
  sourceRepo,
  sourceBranch,
  commitHash,
  targetBranch
) {
  // Confirmation Information list
  const confirmInfo = [
    {
      "Confirmation Item": "Source project    ",
      Value: chalk.yellow(repoName),
    },
    {
      "Confirmation Item": "Source repo       ",
      Value: chalk.yellow(sourceRepo),
    },
    {
      "Confirmation Item": "Source branch     ",
      Value: chalk.yellow(sourceBranch),
    },
    {
      "Confirmation Item": "Source commit hash",
      Value: chalk.yellow(commitHash),
    },
    {
      "Confirmation Item": "Target branch     ",
      Value: chalk.yellow(targetBranch),
    },
  ];

  console.log(chalk.bold("Confirmation Item   |  Value"));
  console.log("----------------------------");
  confirmInfo.forEach((confirmInfo) => {
    console.log(`${confirmInfo["Confirmation Item"]}  |  ${confirmInfo.Value}`);
  });
  console.log();
}

// Prompt user for input
async function main() {
  // try {
  // Confirm the associated warehouse information
  const { lastRemoteName, lastRemoteUrl } = getLastRemote();

  // Confirm the source repository and whether to use the most recently added remote repository
  const { usingRemoteUrl, usingRemoteName } = await getRepositories(
    lastRemoteName,
    lastRemoteUrl
  );

  try {
    const sourceBranch = await questions.question1();
    const selectedCommit = await questions.question2(
      usingRemoteName,
      sourceBranch
    );
    const commitHash = selectedCommit;
    const targetBranch = await questions.questions3();

    // Print confirmation information
    printConfirmationInfo(
      usingRemoteName,
      usingRemoteUrl,
      sourceBranch,
      commitHash,
      targetBranch
    );

    // pull remote warehouse
    console.log(chalk.greenBright("Fetching from source repository..."));
    execSync(`git fetch ${usingRemoteName} ${sourceBranch}`);
    console.log();

    // Create a temporary branch - 'temp-${sourceBranch}'
    createBranch(`temp-${sourceBranch}`, `${usingRemoteName}/${sourceBranch}`);

    // ToDo 以下部分需要抽离出来
    // Check whether the target branch already exists in the current project.
    // If so, switch to the target branch and execute cherry - pick.Otherwise, create a new branch and execute cherry - pick.
    if (branchExists(targetBranch)) {
      console.log(
        `The target branch already exists, switch to the target branch - "${targetBranch}"...`
      );
      execSync(`git checkout ${targetBranch}`);
      console.log();
    } else {
      console.log(
        `Target branch does not exist, create and switch to the target branch - "${targetBranch}"...`
      );
      // Create a target branch and associate it with a remote branch
      execSync(`git checkout -b ${targetBranch}`);
      execSync(`git push -u origin ${targetBranch}`);
      console.log();
    }

    // Execute cherry pick
    cherryPickAndHandleConflicts(commitHash)
      .then(async () => {
        // If there is no conflict, prompt the user whether to push
        const confirm = await inquirer.prompt([
          {
            type: "confirm",
            name: "pushChanges",
            message:
              "Do you want to push the changes to the remote repository?",
          },
        ]);

        console.log("Waiting push...");
        if (confirm.pushChanges) {
          execSync(`git push -f origin temp-${sourceBranch}:${targetBranch}`, {
            stdio: "inherit",
          });
          console.log(chalk.green("Changes successfully pushed."));
        } else {
          console.log(chalk.yellow("Merge completed but not pushed."));
        }
      })
      .catch((error) => {
        console.error(
          chalk.red(
            `Cherry-pick failed. Resolve the conflicts and perform the merge manually. ${error}`
          )
        );
      });
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
  // } catch (error) {
  //   if (error.isTtyError) {
  //     console.error(
  //       chalk.red("Prompt couldn’t be rendered in the current environment.")
  //     );
  //   } else {
  //     process.exit(1);
  //   }
  //   process.exit(1);
  // }
}

// Run the main function
main();
