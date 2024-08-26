#!/usr/bin/env node

const inquirer = require("inquirer");
const { execSync } = require("child_process");

// Define questions
const questions = [
  {
    type: "input",
    name: "sourceRepo",
    message: "Enter the source repository URL:",
  },
  {
    type: "input",
    name: "sourceBranch",
    message: "Enter the source branch name:",
  },
  {
    type: "input",
    name: "commitHash",
    message: "Enter the commit hash to cherry-pick:",
  },
  {
    type: "input",
    name: "targetBranch",
    message: "Enter the target branch name:",
  },
];

// Prompt user for input
inquirer.prompt(questions).then((answers) => {
  const { sourceRepo, sourceBranch, commitHash, targetBranch } = answers;

  try {
    console.log("Adding source repository...");
    execSync(`git remote add source-repo ${sourceRepo}`);

    console.log("Fetching source branch...");
    execSync(`git fetch source-repo ${sourceBranch}`);

    console.log("Checking out target branch...");
    execSync(`git checkout ${targetBranch}`);

    console.log(`Cherry-picking commit ${commitHash}...`);
    execSync(`git cherry-pick ${commitHash}`, { stdio: "inherit" });
  } catch (error) {
    console.log("Cherry-pick encountered conflicts. Please resolve manually.");
    execSync("git status", { stdio: "inherit" });

    inquirer
      .prompt([
        {
          type: "confirm",
          name: "continueAfterConflict",
          message: "Press Enter to continue after resolving conflicts.",
        },
      ])
      .then(() => {
        execSync("git add -A");
        execSync("git cherry-pick --continue", { stdio: "inherit" });
      });
  }

  inquirer
    .prompt([
      {
        type: "confirm",
        name: "pushChanges",
        message: "Do you want to push the changes to the remote repository?",
      },
    ])
    .then((confirm) => {
      if (confirm.pushChanges) {
        execSync(`git push origin ${targetBranch}`, { stdio: "inherit" });
        console.log("Changes successfully pushed.");
      } else {
        console.log("Merge completed but not pushed.");
      }
      execSync("git remote remove source-repo");
    });
});
