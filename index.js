#!/usr/bin/env node

//Replace lines below if you use your own Coded cluster
let CLUSTER_URL = 'https://api.coded.sh';
let BASE_URL = 'coded.sh';
let parseAppId = 'coded';
////

let exec = require('child_process').exec;
let { spawn } = require('child_process');

let inquirer = require('inquirer');
let Parse = require('parse/node');
let figlet = require('figlet');
let os = require('os');
let fs = require('fs');
let request = require('request');
let package = require('./package.json');
let store = require('data-store')('coded');
let dns = require('dns');

//SSH
let SSHConfig = require('ssh-config');
let keygen = require('ssh-keygen');

let version = `version ${package.version}\n`;

figlet('CODED', {
    font: 'Small Slant',
    horizontalLayout: 'full',
    verticalLayout: 'default'
}, function(err, data) {
    if (err == null) {
        console.log(data);
    }
    console.log(version);
    //Check if Git is installed on this machine
    checkGit();
});

Parse.initialize(parseAppId);
Parse.serverURL = `${CLUSTER_URL}/parse`;
Parse.User.enableUnsafeCurrentUser();

let backBtn = '◁ Back';
let authMenu = [{
    name: 'Login'
}, {
    name: 'Register'
}];

let authQuestions = [{
        type: 'input',
        name: 'email',
        message: 'email'
    },
    {
        type: 'password',
        name: 'password',
        message: 'password'
    }
];

let mainMenu = [{
    name: 'New project'
}, {
    name: 'My servers'
}, {
    name: 'My projects'
}, {
    name: 'Add domain'
}, {
    name: 'Logout'
}, {
    name: 'Exit'
}];

const projectQuestions = [
    {
        type: 'input',
        name: 'project_name',
        message: 'Project Name'
  }
];

//Check if Git installed
function checkGit() {
    var command = 'git --version';
    exec(command, function(err, stdout, stderr) {
        if (stdout.indexOf('git version') == -1) {
            console.log('\n o You should install Git before starting to use Coded CLI.\nYou can download Git at https://git-scm.com/book/en/v2/Getting-Started-Installing-Git\n');
            spinner.stop(true);
            return;
        } else {
            start();
        }
    });
}

function checkCodedKey() {
    let codedKey = `${require('os').homedir()}/.ssh/coded-cli_rsa`;
    if (fs.existsSync(`${codedKey}`)) {
        var sshPubKey = fs.readFileSync(`${codedKey}.pub`, 'utf8');
        savePublicKeyIfNeeded(sshPubKey);
        setupSSHConfig();
    } else {
        const keygen = spawn(`ssh-keygen -b 2048 -t rsa -f ${require('os').homedir()}/.ssh/coded-cli_rsa -N ""`,{
          shell: true
        });
        const timeout = setInterval(function() {
            const file = `${codedKey}.pub`;
            const fileExists = fs.existsSync(file);

            if (fileExists) {
              var sshPubKey = fs.readFileSync(file, 'utf8');
              clearInterval(timeout);
              savePublicKeyIfNeeded(sshPubKey);
              setupSSHConfig();
            }
        }, 1000);
    }

}

function savePublicKeyIfNeeded(pubKey){
  var params = {};
  params["sshKey"] = pubKey;
  params["token"] = Parse.User.current().getSessionToken();

  var sshOptions = {
      method: 'POST',
      json: true,
      url: `${CLUSTER_URL}/ssh-key`,
      body: params,
      headers: {
          "Content-Type": "application/json"
      }
  };
  request(sshOptions, function (error, serverResponse, sshKeyBody) {
    if (error) {
      console.log(`Error: ${error}`);
    }
  });
}

function setupSSHConfig() {
    let sshConfigPath = `${require('os').homedir()}/.ssh/config`;
    if (fs.existsSync(sshConfigPath) == false) {
        spawn('touch', [`${sshConfigPath}`]);
        const timeout = setInterval(function() {
            const fileExists = fs.existsSync(sshConfigPath);
            if (fileExists) {
              clearInterval(timeout);
              addSSHConfigRecord();
            }
        }, 1000);
    } else {
        addSSHConfigRecord();
    }
}

function addSSHConfigRecord() {
    let sshConfigPath = `${require('os').homedir()}/.ssh/config`;
    const fileExists = fs.existsSync(sshConfigPath);
    if (fileExists) {
        const configContents = fs.readFileSync(sshConfigPath, 'utf8');
        const config = SSHConfig.parse(configContents);
        const Server = Parse.Object.extend("Server");
        const query = new Parse.Query(Server);
        query.find({
            success: function(servers) {
                //Load user projects
                const Project = Parse.Object.extend("Project");
                const query = new Parse.Query(Project);
                query.find({
                    success: function(projects) {
                        for (var i = 0; i < servers.length; i++) {
                            let server = servers[i];
                            let projectsOnServer = server.get("projects");
                            for (var k = 0; k < projectsOnServer.length; k++) {
                                let projectOnServer = projectsOnServer[k];
                                for (var t = 0; t < projects.length; t++) {
                                    let project = projects[t];
                                    let projectId = project.id;
                                    if (project.id == projectOnServer) {
                                        let host = `coded-${project.get("name").toLowerCase()}`
                                        config.remove({
                                            Host: host
                                        })
                                        config.append({
                                            Host: host,
                                            HostName: `${server.id.toLowerCase()}.coded.sh`,
                                            User: 'root',
                                            Port: `${project.get('port')}`,
                                            IdentityFile: ['~/.ssh/coded-cli_rsa'],
                                            StrictHostKeyChecking: 'no'
                                        });
                                    }
                                }
                            }
                        }
                        fs.writeFile(sshConfigPath, SSHConfig.stringify(config), function(err) {
                            if(err) {
                                console.log(err);
                            }
                        });
                    }
                });
            }
        });
    }
}

function start() {
    //Check if an user has a valid token
    if (store.get('token') == undefined || store.get('token') == '') {
        authUser();
    } else {
        Parse.User.become(store.get('token')).then(function(user) {
            checkCodedKey();
            showMainMenu();
        }, function(error) {
            authUser();
        });
    }
}

function authUser() {
    var message = 'Hey. What do you want to do?';
    inquirer.prompt([{
        type: 'list',
        message: message,
        name: 'actions',
        choices: authMenu,
        validate: function(answer) {
            return true;
        }
    }]).then(answers => {
        if (answers.actions == 'Login') {
            loginUser();
        } else if (answers.actions == 'Register') {
            registerUser();
        }
    });
}

function loginUser() {
    inquirer.prompt(authQuestions).then(answers => {
        var user = Parse.User.logIn(answers.email, answers.password, {
            success: function(user) {
                store.set('token', user.getSessionToken());
                Parse.User.become(user.getSessionToken()).then(function(user) {
                    checkCodedKey();
                    showMainMenu();
                }, function(error) {});
            },
            error: function(user, error) {
                // Show the error message somewhere and let the user try again.
                console.log("Error: " + error.code + " " + error.message);
            }
        });

    });
}

function registerUser() {
    inquirer.prompt(authQuestions).then(answers => {
        var user = new Parse.User();
        user.set("username", answers.email);
        user.set("email", answers.email);
        user.set("password", answers.password);
        user.signUp().then((user) => {
                store.set('token', user.getSessionToken());
                Parse.User.become(user.getSessionToken()).then(function(user) {
                    checkCodedKey();
                    showMainMenu();
                }, function(error) {
                    console.log('Ooops. Cannot register. ' + error);
                });
            },
            (error) => {
                spinner.stop(true);
                console.log(error.message);
            });
    });
}

function showMainMenu() {
    inquirer.prompt([{
        type: 'list',
        message: `Hey ${Parse.User.current().get("username")}. What do you want to do:`,
        name: 'actions',
        choices: mainMenu,
        validate: function(answer) {
            return true;
        }
    }]).then(answers => {
        if (answers.actions == 'New project') {
            createProject();
        }
        else if (answers.actions == 'My projects') {
            showProjects();
        }
        else if (answers.actions == 'My servers') {
            showServers();
        }else if (answers.actions == 'Add domain') {
            addDomain();
        } else if (answers.actions == 'Logout') {
            logout();
        } else if (answers.actions == 'Exit') {}
    });
}

function showServers() {
    const Server = Parse.Object.extend("Server");
    const query = new Parse.Query(Server);
    const results = query.find({
        success: function(results) {
            if (results.length == 0) {
                console.log(`You haven't any servers yet. Check out https://coded.sh/docs/#/node-setup to add a server.`);
            }
            for (let i = 0; i < results.length; i++) {
                var server = results[i];
                console.log(` o IP: ${server.get("ip")}, status: ${server.get("status")}\n`);
            }
            showMainMenu();
        }
    });
}

function showProjects(){
  const Server = Parse.Object.extend("Server");
  const query = new Parse.Query(Server);
  query.find({
      success: function(servers) {
          //Load user projects
          const Project = Parse.Object.extend("Project");
          const query = new Parse.Query(Project);
          query.find({
              success: function(projects) {
                  if (projects.length > 0){
                    console.log("\nProjects:\n");
                  }else{
                    console.log("\nYou haven't any projects yet");
                  }
                  for (var i = 0; i < servers.length; i++) {
                      let server = servers[i];
                      let projectsOnServer = server.get("projects");
                      for (var k = 0; k < projectsOnServer.length; k++) {
                          let projectOnServer = projectsOnServer[k];
                          for (var t = 0; t < projects.length; t++) {
                              let project = projects[t];
                              let projectId = project.id;
                              if (project.id == projectOnServer) {
                                if (project.get("status") == "setup"){
                                  console.log(` o ${project.get("name")}\n   Installing...It can take up a few minutes\n`);
                                }else{
                                  console.log(` o ${project.get("name")}\n   url: https://${project.id.toLowerCase()}.coded.sh\n   clone: git clone ssh://coded-${project.get("name").toLowerCase()}/${project.get("name").toLowerCase()}.git\n   deploy: git push origin master\n   SSH access: ssh coded-${project.get("name").toLowerCase()}\n   port: 4000\n`);
                                }
                              }
                          }
                      }
                  }
                  showMainMenu();
              }
          });
      }
  });
}

function createProject() {

  //Check if an user has at least one server
  const Server = Parse.Object.extend("Server");
  const query = new Parse.Query(Server);
  const results = query.find({
    success: function(servers) {
      if (servers.length == 0) {
        console.log(`You haven't any servers yet. You should add at least one server to create a project. Check out https://coded.sh/docs/#/node-setup to add a server.`);
        showMainMenu();
        return;
      }
      //Fetch project types
      var choices = [];
      Parse.Config.get().then(function (config) {
        var projectTypes = config.get("projectTypes");
        for (var i = 0; i < projectTypes.length; i++) {
          var projectType = projectTypes[i];
          choices.push({
            name: projectType.name
          });
        }
        inquirer.prompt([
          {
            type: 'list',
            message: "Select project type",
            name: 'actions',
            choices: choices,
            pageSize: 10,
            validate: function (answer) {
              return true;
            }
          }
        ])
        .then(answers => {
          var projectType = "node-js";
          for (var i = 0; i < projectTypes.length; i++) {
            var type = projectTypes[i];
            if (answers.actions == type.name) {
              projectType = type.short_name;
            }
          }
          if (answers.actions == backBtn) {
            showMainMenu();
            return;
          }
          inquirer.prompt(projectQuestions).then(answers => {
            var projectName = answers.project_name.replace(/ /g, '-');
            projectName = projectName.replace(/[^a-zA-Z0-9--]/g, '').toLowerCase();

            //Select a node (server) to create a project
            var choices = [];
            servers.forEach(function (server) {
                choices.push({
                    name: `IP: ${server.get("ip")}`
                });
            });
            inquirer.prompt([
                    {
                        type: 'list',
                        message: "Select server",
                        name: 'actions',
                        choices: choices,
                        pageSize: 10,
                        validate: function (answer) {
                            return true;
                        }
                    }
                ])
                .then(answers => {
                    var serverId = "";
                    for (var i = 0; i < servers.length; i++) {
                        var server = servers[i];
                        if (answers.actions == `IP: ${server.get("ip")}`) {
                            serverId = server.id;
                        }
                        postProject(projectName, projectType, serverId);
                    }
                });
          });
        });
      }, function (error) {});
    }
  });
}

function postProject(projectName, projectType, serverId){
  var params = {};
  params["projectName"] = projectName;
  params["projectType"] = projectType;
  params["serverId"] = serverId;
  params["token"] = Parse.User.current().getSessionToken();
  var postProjectOptions = {
      method: 'POST',
      json: true,
      url: `${CLUSTER_URL}/project`,
      body: params,
      headers: {
          "Content-Type": "application/json"
      }
  };
  request(postProjectOptions, function (error, postProjectResponse, postProjectBody) {
    if (error) {
      console.log(`Error: ${error}`);
    }
    console.log(`Creating your project. It can take up a few minutes... You can check out the status of your new project in "My projects".`);
    showMainMenu();
    addSSHConfigRecord();
  });
}

function addDomain(){
  var availableProjects = [];
  const Server = Parse.Object.extend("Server");
  const query = new Parse.Query(Server);
  query.find({
      success: function(servers) {
          //Load user projects
          const Project = Parse.Object.extend("Project");
          const query = new Parse.Query(Project);
          query.find({
              success: function(projects) {
                  if (projects.length == 0){
                    console.log("\nYou haven't any projects yet");
                  }
                  for (var i = 0; i < servers.length; i++) {
                      let server = servers[i];
                      let projectsOnServer = server.get("projects");
                      for (var k = 0; k < projectsOnServer.length; k++) {
                          let projectOnServer = projectsOnServer[k];
                          for (var t = 0; t < projects.length; t++) {
                              let project = projects[t];
                              if (project.id == projectOnServer) {
                                availableProjects.push({
                                    name: `Name: ${project.get("name")}, IP: ${server.get("ip")}`,
                                    server: server,
                                    project: project
                                });
                              }
                          }
                      }
                  }
                  //Show available projects
                  inquirer.prompt([
                          {
                              type: 'list',
                              message: "Select project",
                              name: 'actions',
                              choices: availableProjects,
                              pageSize: 10,
                              validate: function (answer) {
                                  return true;
                              }
                          }
                      ])
                      .then(answers => {
                        for (var i = 0; i < availableProjects.length; i++) {
                            var availableProjectStr = availableProjects[i];
                            if (answers.actions == availableProjectStr.name) {
                                checkUserDomain(availableProjectStr.project, availableProjectStr.server);
                            }
                        }
                      });
              }
          });
      }
  });
}

function checkUserDomain(selectedProject, selectedServer){
  const domainQuestions = [
      {
          type: 'input',
          name: 'domain_name',
          message: `Type in your domain without http:// (for example, mydomain.com). Your domain should map to A record in your DNS with IP: ${selectedServer.get("ip")}`
    }
  ];
  inquirer.prompt(domainQuestions).then(answers => {
    var domainName = answers.domain_name;
    dns.lookup(domainName, (err, address, family) => {
      if (address != selectedServer.get("ip")){
        console.log(`Please, check A record for ${domainName} in your DNS. The target of A record should be ${selectedServer.get("ip")} `);
        checkUserDomain(selectedProject, selectedServer);
      }else{
        postDomain(selectedProject, selectedServer, domainName);
      }
    });
  });
}

function postDomain(selectedProject, selectedServer, domainName){
  console.log(`${selectedProject.get("name")} - ${selectedServer.get("ip")} - ${domainName}`);
  var params = {};
  params["projectDomain"] = domainName;
  params["projectId"] = selectedProject.id;
  params["token"] = Parse.User.current().getSessionToken();
  var postProjectOptions = {
      method: 'POST',
      json: true,
      url: `https://${selectedServer.id}.${BASE_URL}/user-domain`,
      body: params,
      headers: {
          "Content-Type": "application/json"
      }
  };
  request(postProjectOptions, function (error, postProjectResponse, postProjectBody) {
    if (error) {
      console.log(`Error: ${error}`);
    }
    console.log(`Domain added. Check it out - https://${domainName}`);
    showMainMenu();
  });
}

function logout() {
    Parse.User.logOut().then(
        (success) => {
            console.log('Logged out');
            store.set('token', '');
            authUser();
        },
        (error) => {
            console.log('Cannot log out. Check your internet connection.');
        });
}
