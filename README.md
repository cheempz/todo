This sample app is based on TodoMVC framework.

TodoMVC is a project which offers the same Todo application implemented using MV* concepts in most of the popular JavaScript MV\* frameworks of today.

## Run the app

To get the app running, follow the instructions below:
- Install and run MongoDB <br/>
	$ sudo apt-get install mongodb <br/>
	$ sudo service mongodb stop <br/>
	$ sudo mkdir $HOME/db ; sudo mongod --dbpath $HOME/db --port 80 --fork --logpath /var/tmp/mongodb <br/>
- Install and run the app <br/>
	$ git clone <git-repo-url> <br/>
	$ cd todomvc-mongodb, npm install <br/>
	$ node server.js --fe_ip <IP of machine running the app> --be_ip <IP of machine running mongodb> <br/>

Appoptics
    server.js has been modified to add settings that make it easier to test AppOptics.
    See the code for details but the most useful are:

    - `-r rate` sets the sample rate to 'rate' percent (I got tired of entering zeros)
    - `--rate rate` sets the rate to 'rate' (0 to 1,000,000)
    - `--fe_ip host[:port]` what the webserver listens on.
    - `--be_ip host[:port]` where to find the mongo server
    - the ssl port is hardcoded to 8443 at this time. it uses the `--fe_ip` host.
    - it supports many transactions that provide insight into the server and appoptics


example - sample rate of 100%, serve port 8889 on localhost: <br/>
  `$ node server -r 100 --fe_ip=localhost:8889`

example - check the server config: <br/>
  `$ curl localhost:8889/config`

## generating a load against the server

see bmacnaughton/multiload for a test driver that can perform transactions at specific rates against this server.

## License

Everything in this repo is MIT License unless otherwise specified.

Original todomvc-mongodb MIT © Addy Osmani, Sindre Sorhus, Pascal Hartig, Stephen Sawchuk.
Extensions MIT © Bruce MacNaughton
