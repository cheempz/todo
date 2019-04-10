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
	$ cd todo, npm install <br/>
	$ node server.js --ws-ip <IP of machine running the app> --db-ip <IP of machine running mongodb> <br/>

Appoptics
    server.js has been modified to add settings that make it easier to test AppOptics in a "real" application.
    It can run using express (default), koa, or hapi as the web server framework. For express the logger to use can be
    set to morgan (default), pino, winston, or bunyan. A quick overview of options can be seen by using the `-h` cli
    option.

    The server responds to many URLs in order to exercise various aspects of AppOptics. The code is the documentation.

example - sample rate of 100%, serve port 8889 on localhost: <br/>
  `$ node server -r 100 --ws-ip=localhost:8889`

example - check the server config: <br/>
  `$ curl localhost:8889/config`

## generating a load against the server

see bmacnaughton/multiload for a test driver that can perform transactions at specific rates against this server.

## License

Everything in this repo is MIT License unless otherwise specified.

Original todomvc-mongodb MIT © Addy Osmani, Sindre Sorhus, Pascal Hartig, Stephen Sawchuk.
Extensions MIT © Bruce MacNaughton
